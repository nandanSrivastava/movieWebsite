import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Missing token parameter' }, { status: 400 });
    }

    let userRole = 'user';
    const isSupabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!isSupabaseConfigured) {
      const mockSession = req.cookies.get('cinebook_mock_session');
      if (mockSession) {
        try {
          const sessionObj = JSON.parse(mockSession.value);
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
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  cookieStore.set(name, value, options)
                );
              } catch {}
            },
          },
        }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const profile = await db.getProfile(user.id);
        userRole = profile?.role || 'user';
      }
    }

    if (userRole !== 'admin' && userRole !== 'member') {
      return NextResponse.json({ error: 'Forbidden: Staff access required' }, { status: 403 });
    }

    // Extract booking ID from signature-wrapped token (e.g. tkt_bookingId_randomhash)
    const match = token.match(/tkt_(?:cash_)?([a-zA-Z0-9_\-]+)_[a-zA-Z0-9]+/);
    const bookingId = match ? match[1] : token;

    const booking = await db.getBookingById(bookingId);

    if (!booking) {
      return NextResponse.json({ verified: false, error: 'Ticket not found in the registry.' }, { status: 404 });
    }

    // Verify token token signature matches the DB record
    if (booking.qr_code_token !== token) {
      return NextResponse.json({ verified: false, error: 'Invalid ticket verification signature. Forgery suspected.' }, { status: 400 });
    }

    if (booking.payment_status !== 'paid') {
      return NextResponse.json({ verified: false, error: `Ticket checkout is not paid. Status: ${booking.payment_status}` }, { status: 400 });
    }

    return NextResponse.json({
      verified: true,
      booking
    });

  } catch (err: any) {
    console.error('Verify booking API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
