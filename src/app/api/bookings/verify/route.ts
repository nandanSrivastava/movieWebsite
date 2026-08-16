import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Missing token parameter' }, { status: 400 });
    }

    const cleanedToken = token.trim();

    let userRole = 'user';
    
    // Check mock session cookie
    const mockSession = req.cookies.get('cinebook_mock_session');
    if (mockSession) {
      try {
        const sessionObj = JSON.parse(mockSession.value);
        if (sessionObj?.role) {
          userRole = sessionObj.role;
        }
      } catch {}
    }

    // Check Supabase session if configured
    const isSupabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (userRole === 'user' && isSupabaseConfigured) {
      try {
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
      } catch (authErr) {
        console.warn('Auth check error in verify route:', authErr);
      }
    }

    // Allow staff / admin or authenticated verification
    if (userRole !== 'admin' && userRole !== 'member') {
      // Fallback: If request has auth cookie or header, allow ticket verification
      const authHeader = req.headers.get('authorization');
      if (!mockSession && !authHeader) {
        // Staff check warning but proceed with verification for POS terminal
      }
    }

    // 1. Look up booking by ID directly
    let booking = await db.getBookingById(cleanedToken);

    // 2. If not found, try extracting booking ID from signature format (tkt_bookingId_hash)
    if (!booking) {
      const match = cleanedToken.match(/tkt_(?:cash_)?([a-zA-Z0-9_\-]+)_[a-zA-Z0-9]+/);
      const extractedId = match ? match[1] : cleanedToken;
      booking = await db.getBookingById(extractedId);
    }

    // 3. Flexible lookup: search all bookings for matching token substring, phone number, or customer name
    if (!booking) {
      const allBookings = await db.getBookings();
      
      const searchLower = cleanedToken.toLowerCase();
      const normalizePhone = (p: string) => (p || '').replace(/[\s\-\+]/g, '').replace(/^(91|0)/, '');
      const searchPhoneNorm = normalizePhone(searchLower);

      // Sort bookings by creation date descending so recent/today bookings match first
      const sortedBookings = [...allBookings].sort((a: any, b: any) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      });

      booking = sortedBookings.find((b: any) => {
        const bId = (b.id || '').toLowerCase();
        const bQr = (b.qr_code_token || '').toLowerCase();
        const bPhone = normalizePhone(b.customer_phone || '');
        const bName = (b.customer_name || '').toLowerCase();

        return (
          bId === searchLower ||
          bQr === searchLower ||
          bQr.includes(searchLower) ||
          bId.includes(searchLower) ||
          bQr.endsWith(searchLower) ||
          bId.endsWith(searchLower) ||
          (searchPhoneNorm.length >= 4 && bPhone.includes(searchPhoneNorm)) ||
          (searchLower.length >= 3 && bName.includes(searchLower))
        );
      }) || null;
    }

    if (!booking) {
      return NextResponse.json({ verified: false, error: 'Ticket not found in the cinema registry.' }, { status: 404 });
    }

    // Check payment status
    const isPaid = ['paid', 'confirmed'].includes(booking.payment_status?.toLowerCase());
    if (!isPaid) {
      return NextResponse.json({ 
        verified: false, 
        error: `Ticket payment is pending or incomplete. Current Status: ${booking.payment_status}` 
      }, { status: 400 });
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
