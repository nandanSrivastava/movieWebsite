import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';

const unlockRequestSchema = z.object({
  showId: z.string().min(1),
  seatLayoutIds: z.array(z.string().min(1)).min(1),
  anonSessionId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Get body payload and validate
    const body = await req.json();
    const result = unlockRequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid inputs', details: result.error.format() }, { status: 400 });
    }
    const { showId, seatLayoutIds, anonSessionId } = result.data;

    // 2. Identify User Session (authenticated or anonymous)
    let userId: string | null = null;
    const isSupabaseConfigured = 
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
      (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!isSupabaseConfigured) {
      // Mock mode auth resolution
      const mockSession = req.cookies.get('cinebook_mock_session');
      if (mockSession) {
        try {
          const sessionObj = JSON.parse(mockSession.value);
          userId = sessionObj.id;
        } catch {}
      }
    } else {
      // Live mode auth resolution
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
        userId = userRes.data.user.id;
      }
    }

    // Fall back to anonymous session ID if no authenticated user
    if (!userId && anonSessionId) {
      userId = anonSessionId;
    }

    if (!userId) {
      return NextResponse.json({ error: 'No session to unlock seats.' }, { status: 401 });
    }

    // Check if requester is admin
    let isAdmin = false;
    if (userId) {
      const profile = await db.getProfile(userId);
      if (profile?.role === 'admin') isAdmin = true;
    }

    // 3. Unlock Seats
    await db.unlockSeats(showId, seatLayoutIds, userId, isAdmin);

    // 4. Log Audit Event
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const isAnon = !!anonSessionId && userId === anonSessionId;
    await db.logAudit(isAnon ? null : userId, 'SEAT_UNLOCK', { showId, seatLayoutIds, anonymous: isAnon }, ip);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Seat unlock API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

