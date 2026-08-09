import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';

async function isAdmin(req: NextRequest): Promise<boolean> {
  try {
    let userRole = 'user';
    const isSupabaseConfigured = 
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
      (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!isSupabaseConfigured) {
      const mockSession = req.cookies.get('cinebook_mock_session');
      if (mockSession) {
        const sessionObj = JSON.parse(mockSession.value);
        userRole = sessionObj.role;
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

    return userRole === 'admin';
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const shows = await db.getShows();

    let enrichedShows = [];
    if (db.isMock) {
      // In-memory mock database: load occupancy ratios
      enrichedShows = await Promise.all(shows.map(async (show) => {
        const seats = await db.getSeatsForShow(show.id);
        const booked = seats.filter(s => s.status === 'booked').length;
        const total = seats.length;
        return {
          ...show,
          bookedSeats: booked,
          totalSeats: total,
          occupancyRate: total > 0 ? Math.round((booked / total) * 100) : 0
        };
      }));
    } else {
      // Live Supabase Mode: fetch all statuses in exactly one query
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const { data: statuses, error: statusErr } = await supabase
        .from('seat_status')
        .select('show_id, status');

      if (statusErr) {
        throw statusErr;
      }

      const countsMap: Record<string, { booked: number; total: number }> = {};
      (statuses || []).forEach((item: any) => {
        if (!countsMap[item.show_id]) {
          countsMap[item.show_id] = { booked: 0, total: 0 };
        }
        countsMap[item.show_id].total++;
        if (item.status === 'booked') {
          countsMap[item.show_id].booked++;
        }
      });

      enrichedShows = shows.map((show) => {
        const counts = countsMap[show.id] || { booked: 0, total: 0 };
        return {
          ...show,
          bookedSeats: counts.booked,
          totalSeats: counts.total,
          occupancyRate: counts.total > 0 ? Math.round((counts.booked / counts.total) * 100) : 0
        };
      });
    }

    return NextResponse.json({ shows: enrichedShows });
  } catch (err: any) {
    console.error('Fetch shows API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const body = await req.json();
    const { movie_id, screen_id, show_date, show_time, price_normal, price_premium, price_recliner } = body;

    if (!movie_id || !screen_id || !show_date || !show_time) {
      return NextResponse.json({ error: 'Missing required show fields' }, { status: 400 });
    }

    const newShow = await db.createShow({
      movie_id,
      screen_id,
      show_date,
      show_time,
      price_normal: Number(price_normal) || 180,
      price_premium: Number(price_premium) || 250,
      price_recliner: Number(price_recliner) || 400
    });

    return NextResponse.json({ success: true, show: newShow });
  } catch (err: any) {
    console.error('Create show error:', err);
    return NextResponse.json({ error: err.message || 'Failed to schedule showtime' }, { status: 500 });
  }
}
