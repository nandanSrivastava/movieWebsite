import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, isMockMode } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';
import Razorpay from 'razorpay';
import { rateLimiter } from '@/lib/rateLimit';
import { ticketConfirmationEmail } from '@/lib/email/templates';
import { sendEmail, isEmailConfigured } from '@/lib/mailer';

const createOrderSchema = z.object({
  showId: z.string().min(1),
  seatLayoutIds: z.array(z.string().min(1)).min(1).max(10),
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(1).max(20),
  customerEmail: z.string().trim().email('Invalid email address').max(255).optional().or(z.literal('')),
  idempotencyKey: z.string().uuid(),
  paymentMethod: z.enum(['online', 'cash']).optional().default('online'),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limit order creation per IP — anonymous callers can otherwise
    // flood the bookings table with pending rows (no lock required).
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    if (rateLimiter.isRateLimited(ip, 20, 60000)) {
      return NextResponse.json({ error: 'Too many order requests. Please try again in a minute.' }, { status: 429 });
    }

    const body = await req.json();
    const result = createOrderSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid inputs', details: result.error.format() }, { status: 400 });
    }
    const { showId, seatLayoutIds, customerName, customerPhone, customerEmail, idempotencyKey, paymentMethod } = result.data;

    // 1. Resolve Auth User
    let userId: string | null = null;
    let userRole = 'user';
    const isSupabaseConfigured = 
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
      (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

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
        const profile = await db.getProfile(userId);
        userRole = profile?.role || 'user';
      }
    }

    // Role check for POS cash transactions
    if (paymentMethod === 'cash' && !['admin', 'member'].includes(userRole)) {
      return NextResponse.json({ error: 'Forbidden: Only administrators and counter staff can issue cash bookings.' }, { status: 403 });
    }

    // 2. Create Booking Entry in Database (Idempotent)
    const booking = await db.createBooking(showId, seatLayoutIds, userId, paymentMethod === 'cash' ? 'counter' : 'online', {
      name: customerName,
      phone: customerPhone,
      email: customerEmail || undefined,
      idempotencyKey
    });

    // 3. Handle Cash Booking Overrides (Bypass Razorpay)
    if (paymentMethod === 'cash') {
      const success = await db.confirmBooking(booking.id, showId, seatLayoutIds, userId || 'cashier');
      if (!success) {
        return NextResponse.json({ error: 'Seat lock hold expired or already booked' }, { status: 409 });
      }

      const qrToken = `tkt_cash_${booking.id}_${Math.random().toString(36).substring(2, 12)}`;
      const paymentId = `pay_cash_${Math.random().toString(36).substring(2, 9)}`;
      await db.finalizeBooking(booking.id, paymentId, qrToken);

      const ip2 = req.headers.get('x-forwarded-for') || 'unknown';
      await db.logAudit(userId || 'cashier', 'BOOKING_CONFIRM_CASH_POS', { bookingId: booking.id, seatLayoutIds, amount: booking.total_amount }, ip2);

      // Send cash-sale receipt email when a real address was captured
      const saleEmail = booking.customer_email;
      if (saleEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(saleEmail) && isEmailConfigured()) {
        try {
          const { generateQRCodeDataUrl } = await import('@/features/shared/utils/qr');
          const qrCodeDataUrl = await generateQRCodeDataUrl(qrToken);
          const fullBooking = await db.getBookingById(booking.id);
          const ctx = {
            customerName: fullBooking?.customer_name || null,
            bookingId: booking.id,
            movieTitle: fullBooking?.show?.movie?.title || 'Movie',
            screenName: fullBooking?.show?.screen?.name || 'Standard Screen',
            showDate: fullBooking?.show?.show_date || '—',
            showTime: fullBooking?.show?.show_time || '—',
            seats: fullBooking?.booking_seats
              ?.map((bs: any) => `${bs.seat_layout?.row_label || ''}-${bs.seat_layout?.seat_number || ''}`)
              .join(', ') || 'N/A',
            totalAmount: Number(booking.total_amount),
            qrCodeDataUrl,
            qrToken,
          };
          await sendEmail({
            to: saleEmail,
            subject: `Dhrub Cineplex — Cash Sale Ticket (${ctx.movieTitle})`,
            html: ticketConfirmationEmail({ ...ctx, paymentMode: 'cash' })
          });
        } catch (emailErr) {
          console.error('Failed to send cash sale email:', emailErr);
        }
      }

      return NextResponse.json({
        isMock: false,
        isCash: true,
        bookingId: booking.id
      });
    }

    const isRazorpayConfigured = !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;

    if (process.env.NODE_ENV === 'production' && !isRazorpayConfigured) {
      return NextResponse.json({ error: 'Razorpay keys not configured in production' }, { status: 503 });
    }

    if (isMockMode || !isRazorpayConfigured) {
      // ── MOCK CHECKOUT SETUP ─────────────────────────────────
      return NextResponse.json({
        isMock: true,
        bookingId: booking.id,
        amount: booking.total_amount,
        customerName: booking.customer_name,
        customerPhone: booking.customer_phone,
        razorpayOrderId: booking.razorpay_order_id || `order_mock_${booking.id}`
      });
    }

    // ── LIVE RAZORPAY ORDER SETUP ─────────────────────────────
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!
    });

    const options = {
      amount: Math.round(Number(booking.total_amount) * 100), // convert to paise
      currency: 'INR',
      receipt: booking.id,
      notes: {
        bookingId: booking.id,
        userId: userId || 'anonymous'
      }
    };

    const order = await razorpay.orders.create(options);

    if (isSupabaseConfigured) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      await supabase.from('bookings').update({ razorpay_order_id: order.id }).eq('id', booking.id);
    }

    return NextResponse.json({
      isMock: false,
      keyId: process.env.RAZORPAY_KEY_ID,
      bookingId: booking.id,
      amount: booking.total_amount,
      razorpayOrderId: order.id,
      customerName: booking.customer_name,
      customerPhone: booking.customer_phone
    });

  } catch (err: any) {
    console.error('Create order API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
