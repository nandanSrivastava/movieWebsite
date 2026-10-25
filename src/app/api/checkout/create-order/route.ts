import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, isMockMode } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp, getHoldOwner } from '@/lib/requestAuth';
import { getRazorpay, isRazorpayConfigured, newQrToken, toPaise } from '@/lib/payments';
import { queueTicketEmail } from '@/lib/mailer';

const createOrderSchema = z.object({
  showId: z.string().min(1).max(100),
  seatLayoutIds: z.array(z.string().min(1).max(100)).min(1).max(10)
    .refine(ids => new Set(ids).size === ids.length, 'Duplicate seats'),
  customerName: z.string().trim().min(1).max(100),
  customerPhone: z.string().trim().min(6).max(20).regex(/^[+\d\s()-]+$/, 'Invalid phone number'),
  customerEmail: z.string().trim().email('Invalid email address').max(255).optional().or(z.literal('')),
  idempotencyKey: z.string().uuid(),
  paymentMethod: z.enum(['online', 'cash']).optional().default('online'),
});

// Razorpay checkout closes after this long; seat holds are extended to cover it
const CHECKOUT_WINDOW_SECONDS = 10 * 60;
const HOLD_SLACK_SECONDS = 2 * 60;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await rateLimit(`order:${ip || 'unknown'}`, 20, 60, 'Too many order requests. Please try again in a minute.');
    if (limited) return limited;

    const result = createOrderSchema.safeParse(await req.json().catch(() => null));
    if (!result.success) {
      return NextResponse.json({ error: 'Please check your name, phone number and email.' }, { status: 400 });
    }
    const { showId, seatLayoutIds, customerName, customerPhone, customerEmail, idempotencyKey, paymentMethod } = result.data;

    // 1. Who is buying, and whose seat holds this booking uses
    const { owner, user } = await getHoldOwner(req, false);
    if (!owner) {
      return NextResponse.json({ error: 'Your seat hold has expired. Please select your seats again.' }, { status: 409 });
    }

    if (paymentMethod === 'cash' && (!user || !['admin', 'member'].includes(user.role))) {
      return NextResponse.json({ error: 'Forbidden: Only administrators and counter staff can issue cash bookings.' }, { status: 403 });
    }

    // 2+3. One atomic step in the database: the show hasn't started, the caller
    // still holds every seat (holds extended to cover payment), prices come from
    // the DB, and the booking is written with its seats. A checkout key only
    // returns the caller's own booking; repeat clicks reuse one pending booking.
    const pending = await db.createPendingBooking({
      showId,
      seatLayoutIds,
      userId: user?.id ?? null,
      holdOwner: owner,
      channel: paymentMethod === 'cash' ? 'counter' : 'online',
      name: customerName,
      phone: customerPhone,
      email: customerEmail || null,
      idempotencyKey,
      holdSeconds: CHECKOUT_WINDOW_SECONDS + HOLD_SLACK_SECONDS,
    });

    if (pending.status === 'show_started') {
      return NextResponse.json({ error: 'This show has already started.' }, { status: 400 });
    }
    if (pending.status === 'hold_expired') {
      return NextResponse.json({ error: 'Your seat hold has expired. Please select your seats again.' }, { status: 409 });
    }
    if (pending.status === 'invalid' || !pending.booking) {
      return NextResponse.json({ error: 'Those seats are not available for this show. Please start again.' }, { status: 400 });
    }

    const booking = pending.booking;
    const holdExpiresAt = pending.holdExpiresAt;

    if (booking.payment_status === 'paid') {
      return NextResponse.json({ alreadyPaid: true, bookingId: booking.id, accessKey: booking.access_key });
    }

    // 4. Cash sale at the counter: confirm right away
    if (paymentMethod === 'cash') {
      const paymentId = `pay_cash_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const outcome = await db.finalizePayment(booking.id, paymentId, newQrToken(booking.id), 'failed');
      if (outcome !== 'confirmed' && outcome !== 'already_paid') {
        return NextResponse.json({ error: 'These seats were sold before the sale completed. Do not take payment; pick other seats.' }, { status: 409 });
      }

      await db.logAudit(user!.id, 'BOOKING_CONFIRM_CASH_POS', { bookingId: booking.id, seatLayoutIds, amount: booking.total_amount }, ip || undefined);
      queueTicketEmail(booking.id);

      return NextResponse.json({ isMock: false, isCash: true, bookingId: booking.id, accessKey: booking.access_key });
    }

    // 5. Online payment
    if (process.env.NODE_ENV === 'production' && !isRazorpayConfigured()) {
      return NextResponse.json({ error: 'Online payments are not available right now.' }, { status: 503 });
    }

    if (isMockMode || !isRazorpayConfigured()) {
      const mockOrderId = booking.razorpay_order_id || `order_mock_${booking.id}`;
      if (!booking.razorpay_order_id) await db.setBookingOrderId(booking.id, mockOrderId);
      return NextResponse.json({
        isMock: true,
        bookingId: booking.id,
        accessKey: booking.access_key,
        amount: booking.total_amount,
        customerName: booking.customer_name,
        customerPhone: booking.customer_phone,
        razorpayOrderId: mockOrderId,
        holdExpiresAt,
      });
    }

    // Reuse the order if this checkout already created one (double click, retry)
    let orderId = booking.razorpay_order_id;
    if (!orderId) {
      const order = await getRazorpay().orders.create({
        amount: toPaise(booking.total_amount),
        currency: 'INR',
        receipt: booking.id,
        notes: { bookingId: booking.id },
      });
      orderId = order.id;
      await db.setBookingOrderId(booking.id, orderId);
    }

    return NextResponse.json({
      isMock: false,
      keyId: process.env.RAZORPAY_KEY_ID,
      bookingId: booking.id,
      accessKey: booking.access_key,
      amount: booking.total_amount,
      razorpayOrderId: orderId,
      customerName: booking.customer_name,
      customerPhone: booking.customer_phone,
      customerEmail: booking.customer_email,
      holdExpiresAt,
      checkoutTimeoutSeconds: CHECKOUT_WINDOW_SECONDS,
    });
  } catch (err) {
    console.error('Create order API error:', err);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
