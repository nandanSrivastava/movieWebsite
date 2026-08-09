import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user role
    let userRole = 'user';
    const isSupabaseConfigured = 
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
      (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!isSupabaseConfigured) {
      const mockSession = req.cookies.get('cinebook_mock_session');
      if (mockSession) {
        try {
          const sessionObj = JSON.parse(mockSession.value);
          userRole = sessionObj.role;
        } catch {}
      }
    } else {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      
      let userRes;
      if (token) {
        userRes = await supabase.auth.getUser(token);
      } else {
        userRes = await supabase.auth.getUser();
      }

      if (userRes.data.user) {
        const profile = await db.getProfile(userRes.data.user.id);
        userRole = profile?.role || 'user';
      }
    }

    if (!['admin', 'member'].includes(userRole)) {
      return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
    }

    // 2. Fetch and aggregate active locks across all scheduled shows
    const shows = await db.getShows();
    const activeLocks = [];

    for (const show of shows) {
      const seats = await db.getSeatsForShow(show.id);
      
      const lockedSeats = seats.filter((s) => {
        return (
          s.status === 'locked' &&
          s.lock_expires_at &&
          new Date(s.lock_expires_at).getTime() > Date.now()
        );
      });

      for (const seat of lockedSeats) {
        activeLocks.push({
          showId: show.id,
          movieTitle: show.movie?.title || 'Unknown Movie',
          screenName: show.screen?.name || 'Standard Screen',
          showTime: show.show_time,
          seatId: seat.id,
          seatLayoutId: seat.seat_layout_id,
          seatLabel: `${seat.seat_layout?.row_label}-${seat.seat_layout?.seat_number}`,
          lockedBy: seat.locked_by,
          expiresAt: seat.lock_expires_at
        });
      }
    }

    const response = NextResponse.json({ activeLocks });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    return response;
  } catch (err: any) {
    console.error('Fetch active locks API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
