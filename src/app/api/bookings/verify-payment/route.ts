import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/requestAuth';
import { getRazorpay, isRazorpayConfigured, settlePayment } from '@/lib/payments';

const verifySchema = z.object({
  bookingId: z.string().min(1).max(100),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
});

/**
 * Browser fallback after Razorpay checkout: if the webhook hasn't landed yet,
 * ask Razorpay directly. Unauthenticated by design, but it can only confirm a
 * payment Razorpay says was captured for this booking's own order.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(`verify:${getClientIp(req) || 'unknown'}`, 20, 60, 'Too many verification attempts. Please wait a minute.');
    if (limited) return limited;

    const result = verifySchema.safeParse(await req.json().catch(() => null));
    if (!result.success) {
      return NextResponse.json({ error: 'Missing bookingId or paymentId' }, { status: 400 });
    }
    const { bookingId, paymentId } = result.data;

    const booking = await db.getBookingById(bookingId);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.payment_status === 'paid') return NextResponse.json({ status: 'confirmed' });
    if (booking.payment_status === 'refund_pending' || booking.payment_status === 'refunded') {
      return NextResponse.json({ status: 'refunded' });
    }

    if (!isRazorpayConfigured()) {
      return NextResponse.json({ error: 'Online payments are not configured' }, { status: 503 });
    }

    const rz = getRazorpay();
    let payment: any = await rz.payments.fetch(paymentId);
    if (payment.order_id !== booking.razorpay_order_id) {
      return NextResponse.json({ status: 'pending', error: 'Payment does not belong to this booking' });
    }

    if (payment.status === 'authorized') {
      // Auto-capture off or lagging: capture what the customer approved
      payment = await rz.payments.capture(paymentId, payment.amount, payment.currency);
    }
    if (payment.status !== 'captured') {
      return NextResponse.json({ status: 'pending' });
    }

    const outcome = await settlePayment(booking, payment, 'verify');
    if (outcome === 'confirmed' || outcome === 'already_paid') return NextResponse.json({ status: 'confirmed' });
    if (outcome === 'refund_queued') return NextResponse.json({ status: 'refunded' });
    return NextResponse.json({ status: 'pending' });
  } catch (err) {
    console.error('Verify payment API error:', err);
    return NextResponse.json({ error: 'Could not verify the payment right now' }, { status: 500 });
  }
}
