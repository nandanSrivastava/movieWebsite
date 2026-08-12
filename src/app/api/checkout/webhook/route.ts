import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, isMockMode } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';
import Razorpay from 'razorpay';
import { ticketConfirmationEmail } from '@/lib/email/templates';
import { sendEmail, isEmailConfigured } from '@/lib/mailer';

function buildBookingEmailContext(booking: any) {
  const seatsStr = booking.booking_seats
    ?.map((bs: any) => `${bs.seat_layout?.row_label || ''}-${bs.seat_layout?.seat_number || ''}`)
    .join(', ') || 'N/A';

  return {
    customerName: booking.customer_name,
    bookingId: booking.id,
    movieTitle: booking.show?.movie?.title || 'Movie',
    screenName: booking.show?.screen?.name || 'Standard Screen',
    showDate: booking.show?.show_date || '—',
    showTime: booking.show?.show_time || '—',
    seats: seatsStr,
    totalAmount: Number(booking.total_amount),
    qrToken: undefined as string | undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    
    // Check if client is executing in Mock Mode or if Razorpay is not configured
    const isMockTrigger = req.headers.get('x-mock-payment') === 'true' && process.env.NODE_ENV !== 'production' && isMockMode;
    const isRazorpayConfigured = !!process.env.RAZORPAY_WEBHOOK_SECRET;

    if (process.env.NODE_ENV === 'production' && !isRazorpayConfigured) {
      return NextResponse.json({ error: 'Razorpay webhook secret not configured in production' }, { status: 503 });
    }

    let eventId = '';
    let orderId = '';
    let paymentId = '';
    let bookingId = '';

    if (isMockMode || !isRazorpayConfigured || isMockTrigger) {
      // ── MOCK WEBHOOK DESERIALIZATION ───────────────────────
      const body = JSON.parse(rawBody);
      eventId = body.eventId || `evt_mock_${Math.random().toString(36).substring(2, 9)}`;
      orderId = body.orderId;
      paymentId = body.paymentId || `pay_mock_${Math.random().toString(36).substring(2, 9)}`;
      bookingId = body.bookingId;
    } else {
      // ── LIVE SIGNATURE VERIFICATION ──────────────────────────
      const signature = req.headers.get('x-razorpay-signature');
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET!;

      if (!signature) {
        return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
      }

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        return NextResponse.json({ error: 'Invalid signature verification failed' }, { status: 400 });
      }

      // Parse payload
      const event = JSON.parse(rawBody);
      eventId = event.id;

      if (event.event === 'order.paid' || event.event === 'payment.captured') {
        const paymentEntity = event.payload.payment?.entity;
        const orderEntity = event.payload.order?.entity;

        orderId = orderEntity?.id || paymentEntity?.order_id;
        paymentId = paymentEntity?.id;
        bookingId = orderEntity?.notes?.bookingId || paymentEntity?.notes?.bookingId;
      } else {
        // Event type we don't handle
        return NextResponse.json({ received: true });
      }
    }

    const isSupabaseConfigured = 
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
      (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Fallback: if notes didn't carry the bookingId but we have the Razorpay
    // order id, resolve the booking from the DB (notes can be absent/edited).
    if (!bookingId && orderId && isSupabaseConfigured) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: byOrder } = await supabase
        .from('bookings')
        .select('id')
        .eq('razorpay_order_id', orderId)
        .maybeSingle();
      if (byOrder) bookingId = byOrder.id;
    }

    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId notes' }, { status: 400 });
    }

    // ── ATOMIC IDEMPOTENCY GUARD ──────────────────────────────
    // Check if this webhook event was already processed
    if (isSupabaseConfigured) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      // Insert eventId. Due to primary key constraint, duplicate events fail automatically (race prevention)
      const { error: eventErr } = await supabase
        .from('processed_webhook_events')
        .insert({ razorpay_event_id: eventId });

      if (eventErr) {
        // Already processed
        console.log(`Webhook event ${eventId} already processed.`);
        return NextResponse.json({ received: true, duplicate: true });
      }
    }

    // ── DATABASE CONCURRENCY RESOLUTION ───────────────────────
    // 1. Fetch booking record
    const booking = await db.getBookingById(bookingId);
    if (!booking) {
      return NextResponse.json({ error: 'Booking order not found' }, { status: 404 });
    }

    // If already finalized
    if (booking.payment_status === 'paid') {
      return NextResponse.json({ received: true, status: 'already_paid' });
    }

    // Retrieve seat layout IDs from the booking seats relation
    const seatLayoutIds = booking.booking_seats?.map(bs => bs.seat_layout_id) || [];

    // 2. Perform atomic database lock check (moving seat_status status: locked -> booked)
    // If locks expired, confirmBooking returns false
    const success = await db.confirmBooking(booking.id, booking.show_id, seatLayoutIds, booking.booked_by);

    if (success) {
      // Confirm success: generate secure QR Code ticket validation token
      const qrToken = `tkt_${booking.id}_${crypto.randomBytes(8).toString('hex')}`;
      
      // Finalize paid ticket booking (idempotent — safe against webhook retries)
      await db.finalizeBooking(booking.id, paymentId, qrToken);
      
      // Audit log success
      await db.logAudit(booking.booked_by, 'PAYMENT_CAPTURE_SUCCESS', { 
        bookingId: booking.id, 
        orderId, 
        paymentId,
        amount: booking.total_amount
      });

      // Send ticket confirmation email (only when a real address exists —
      // never email the placeholder, and never crash the webhook on mail failure)
      let customerEmail: string | null = booking.customer_email || null;
      if (!customerEmail && isSupabaseConfigured && booking.booked_by) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: userData } = await supabase.auth.admin.getUserById(booking.booked_by);
        if (userData?.user?.email) {
          customerEmail = userData.user.email;
        }
      }

      if (customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) && isEmailConfigured()) {
        try {
          const { generateQRCodeDataUrl } = await import('@/features/shared/utils/qr');
          const qrCodeDataUrl = await generateQRCodeDataUrl(qrToken);
          const ctx = buildBookingEmailContext(booking);
          const html = ticketConfirmationEmail({ ...ctx, qrCodeDataUrl, qrToken });
          await sendEmail({
            to: customerEmail,
            subject: `Dhrub Cineplex — Ticket Confirmed (${ctx.movieTitle})`,
            html
          });
        } catch (emailErr) {
          console.error('Failed to send confirmation email:', emailErr);
        }
      }

      return NextResponse.json({ received: true, status: 'confirmed' });
    } else {
      // ── CONCURRENCY EXPIRED SEAT LOCK FAILURE (REFUND FLOW) ──
      // This occurs if the customer pays after the 6 minute threshold, when seat sweeps unlocked the seats.
      await db.updateBookingStatus(booking.id, 'failed');
      
      // Log critical conflict
      await db.logAudit(booking.booked_by, 'PAYMENT_CAPTURE_CONFLICT_HOLD_EXPIRED', {
        bookingId: booking.id,
        orderId,
        paymentId,
        note: 'Seats were swept/released before payment capture completed. Automatic refund flagged.'
      });

      // Trigger automatic refund (In mock mode, log. In live mode, we can hit Razorpay refund APIs)
      console.warn(`CRITICAL: Seat hold expired for booking ${booking.id}. Payment ${paymentId} requires refund.`);
      
      if (!isMockMode && isRazorpayConfigured) {
        try {
          const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID!,
            key_secret: process.env.RAZORPAY_KEY_SECRET!
          });
          
          await razorpay.payments.refund(paymentId, {
            amount: Math.round(Number(booking.total_amount) * 100),
            notes: {
              reason: 'Seat lock hold expired before checkout completion.',
              bookingId: booking.id
            }
          });
          
          await db.updateBookingStatus(booking.id, 'refunded');
          await db.logAudit(booking.booked_by, 'PAYMENT_REFUND_AUTO_TRIGGERED', {
            bookingId: booking.id,
            paymentId
          });
        } catch (refundErr) {
          console.error(`Refund failed for payment ${paymentId}:`, refundErr);
        }
      }

      return NextResponse.json({ received: true, status: 'conflict_expired_hold_refunded' });
    }

  } catch (err: any) {
    console.error('Webhook execution error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
