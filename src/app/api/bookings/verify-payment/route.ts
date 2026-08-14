import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { rateLimiter } from '@/lib/rateLimit';
import { sendBookingTicketEmail } from '@/lib/mailer';

export async function POST(req: NextRequest) {
  try {
    // Unauthenticated by design (fallback after a successful Razorpay payment),
    // so rate-limit it to prevent it being used as a free API/refund hammer.
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    if (rateLimiter.isRateLimited(ip, 10, 60000)) {
      return NextResponse.json({ error: 'Too many verification attempts. Please wait a minute.' }, { status: 429 });
    }

    const { bookingId, paymentId } = await req.json();

    if (!bookingId || !paymentId) {
      return NextResponse.json({ error: 'Missing bookingId or paymentId' }, { status: 400 });
    }

    const booking = await db.getBookingById(bookingId);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.payment_status === 'paid') {
      // Ensure ticket email was sent if not already done
      sendBookingTicketEmail(booking.id).catch(err => console.error('Error sending ticket email:', err));
      return NextResponse.json({ status: 'confirmed' });
    }

    // Do not re-trigger a refund for a booking already handled by the webhook
    if (booking.payment_status === 'refunded') {
      return NextResponse.json({ status: 'refunded', error: 'Booking was already refunded' });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ error: 'Razorpay not configured' }, { status: 500 });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const payment = await razorpay.payments.fetch(paymentId);

    if ((payment.status === 'captured' || payment.status === 'authorized') && payment.order_id === booking.razorpay_order_id) {
      // If the payment is authorized but not captured (e.g. auto-capture is off), capture it here
      if (payment.status === 'authorized') {
        try {
          await razorpay.payments.capture(paymentId, payment.amount, payment.currency);
        } catch (captureErr) {
          console.error('Failed to capture authorized payment during fallback:', captureErr);
          // If capture fails, we probably shouldn't finalize the booking, but we can return pending
          return NextResponse.json({ status: 'pending', error: 'Failed to capture payment' });
        }
      }

      const seatLayoutIds = booking.booking_seats?.map(bs => bs.seat_layout_id) || [];
      const success = await db.confirmBooking(booking.id, booking.show_id, seatLayoutIds, booking.booked_by);

      if (success) {
        const qrToken = `tkt_${booking.id}_${crypto.randomBytes(8).toString('hex')}`;
        // finalizeBooking is idempotent: if the webhook already finalized this
        // booking, this call returns the existing paid booking untouched.
        await db.finalizeBooking(booking.id, paymentId, qrToken);
        await db.logAudit(booking.booked_by, 'PAYMENT_VERIFY_FALLBACK_SUCCESS', {
          bookingId: booking.id,
          orderId: payment.order_id,
          paymentId,
          amount: booking.total_amount
        });

        // Trigger confirmation email
        sendBookingTicketEmail(booking.id).catch(emailErr => {
          console.error('Failed to send confirmation email on payment verify:', emailErr);
        });

        return NextResponse.json({ status: 'confirmed' });
      } else {
        // Refund logic if seats were swept
        await razorpay.payments.refund(paymentId, {
          amount: Math.round(Number(booking.total_amount) * 100),
          notes: { reason: 'Seat lock hold expired before fallback verify' }
        });
        await db.updateBookingStatus(booking.id, 'refunded');
        return NextResponse.json({ status: 'refunded', error: 'Seat hold expired' });
      }
    } else {
      return NextResponse.json({ status: 'pending', error: 'Payment not captured or authorized' });
    }

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
