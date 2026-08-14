import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';
import { rateLimiter } from '@/lib/rateLimit';

const lockRequestSchema = z.object({
  showId: z.string().min(1),
  seatLayoutIds: z.array(z.string().min(1)).min(1),
  anonSessionId: z.string().uuid().optional(),
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

      if (userRes.data.user) {
        userId = userRes.data.user.id;
      }
    }

    // Fall back to anonymous session ID if no authenticated user
    if (!userId && anonSessionId) {
      userId = anonSessionId;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Please sign in or allow anonymous session to continue.' }, { status: 401 });
    }

    // 2.5. Verify Show is not in the past.
    // show_date is "YYYY-MM-DD" and show_time is "HH:mm" (theater local time = IST).
    // Parse with the explicit IST offset so the comparison is correct even when the
    // server runs in UTC (e.g. Vercel) — a bare `new Date('YYYY-MM-DDTHH:mm')` would
    // be interpreted in server-local time and wrongly allow/block bookings.
    const show = await db.getShowById(showId);
    if (!show) {
      return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    }
    const showDateTime = new Date(`${show.show_date}T${show.show_time}+05:30`);
    if (isNaN(showDateTime.getTime())) {
      return NextResponse.json({ error: 'Invalid show date/time' }, { status: 400 });
    }
    if (showDateTime.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Cannot book seats for a show that has already started or is in the past.' }, { status: 400 });
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
    const isAnon = !!anonSessionId && userId === anonSessionId;
    await db.logAudit(isAnon ? null : userId, 'SEAT_LOCK', { showId, seatLayoutIds, holdSeconds: 360, anonymous: isAnon }, ip);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Seat lock API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

