import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';
import { rateLimiter } from '@/lib/rateLimit';

const lockRequestSchema = z.object({
  showId: z.string().min(1),
  seatLayoutIds: z.array(z.string().min(1)).min(1),
});

export async function POST(req: NextRequest) {
  try {
    // 0. Rate limiting check
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    if (rateLimiter.isRateLimited(ip, 15, 60000)) {
      return NextResponse.json({ error: 'Too many request attempts. Please wait a minute before trying again.' }, { status: 429 });
    }
    // 1. Get body payload and validate
    const body = await req.json();
    const result = lockRequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid inputs', details: result.error.format() }, { status: 400 });
    }
    const { showId, seatLayoutIds } = result.data;

    // 2. Identify Authenticated User Session
    let userId: string | null = null;
    const isSupabaseConfigured =
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!isSupabaseConfigured) {
      // Mock mode auth resolution
      const mockSession = req.cookies.get('cinebook_mock_session');
      if (!mockSession) {
        return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
      }
      try {
        const sessionObj = JSON.parse(mockSession.value);
        userId = sessionObj.id;
      } catch {
        return NextResponse.json({ error: 'Malformed mock session' }, { status: 401 });
      }
    } else {
      // Live mode auth resolution
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      // Fetch session
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');

      let userRes;
      if (token) {
        userRes = await supabase.auth.getUser(token);
      } else {
        // Fallback to checking request cookies
        userRes = await supabase.auth.getUser();
      }

      if (userRes.error || !userRes.data.user) {
        return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
      }
      userId = userRes.data.user.id;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    // 3. Invoke Atomic Transaction Locking
    const success = await db.lockSeats(showId, seatLayoutIds, userId);

    if (!success) {
      return NextResponse.json({
        success: false,
        error: 'One or more selected seats have already been locked or booked by another customer. Please refresh and try again.'
      }, { status: 409 });
    }

    // 4. Log Audit Event
    await db.logAudit(userId, 'SEAT_LOCK', { showId, seatLayoutIds, holdSeconds: 360 }, ip);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Seat lock API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
