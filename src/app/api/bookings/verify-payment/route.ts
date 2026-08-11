import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import Razorpay from 'razorpay';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { bookingId, paymentId } = await req.json();

    if (!bookingId || !paymentId) {
      return NextResponse.json({ error: 'Missing bookingId or paymentId' }, { status: 400 });
    }

    const booking = await db.getBookingById(bookingId);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.payment_status === 'paid') {
      return NextResponse.json({ status: 'confirmed' });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ error: 'Razorpay not configured' }, { status: 500 });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const payment = await razorpay.payments.fetch(paymentId);

    if (payment.status === 'captured' && payment.order_id === booking.razorpay_order_id) {
      const seatLayoutIds = booking.booking_seats?.map(bs => bs.seat_layout_id) || [];
      const success = await db.confirmBooking(booking.id, booking.show_id, seatLayoutIds, booking.booked_by);

      if (success) {
        const qrToken = `tkt_${booking.id}_${crypto.randomBytes(8).toString('hex')}`;
        await db.finalizeBooking(booking.id, paymentId, qrToken);
        await db.logAudit(booking.booked_by, 'PAYMENT_VERIFY_FALLBACK_SUCCESS', {
          bookingId: booking.id,
          orderId: payment.order_id,
          paymentId,
          amount: booking.total_amount
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
      return NextResponse.json({ status: 'pending', error: 'Payment not captured' });
    }

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
