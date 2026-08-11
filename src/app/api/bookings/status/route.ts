import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bookingId = searchParams.get('bookingId');

    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId parameter' }, { status: 400 });
    }

    const booking = await db.getBookingById(bookingId);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    let userId: string | null = null;
    let userRole = 'user';
    const isSupabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!isSupabaseConfigured) {
      const mockSession = req.cookies.get('cinebook_mock_session');
      if (mockSession) {
        try {
          const sessionObj = JSON.parse(mockSession.value);
          userId = sessionObj.id;
          userRole = sessionObj.role;
        } catch {}
      }
    } else {
      const { createServerClient } = await import('@supabase/ssr');
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { get: (name) => cookieStore.get(name)?.value } }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
        const profile = await db.getProfile(userId);
        userRole = profile?.role || 'user';
      }
    }

    if ((booking.booked_by && userId !== booking.booked_by) && userRole !== 'admin' && userRole !== 'member') {
      return NextResponse.json({ payment_status: booking.payment_status });
    }

    const response = NextResponse.json(booking);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    return response;
  } catch (err: any) {
    console.error('Booking status API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
