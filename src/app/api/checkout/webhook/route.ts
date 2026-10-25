import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, isMockMode } from '@/lib/db';
import { settlePayment, toPaise } from '@/lib/payments';

const HANDLED_EVENTS = new Set(['payment.captured', 'order.paid']);

function signatureMatches(rawBody: string, signature: string, secret: string) {
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // ── Local development only: the mock payment gateway posts here ──
    const isMockTrigger = req.headers.get('x-mock-payment') === 'true'
      && process.env.NODE_ENV !== 'production'
      && (isMockMode || !webhookSecret);

    if (isMockTrigger) {
      const body = JSON.parse(rawBody);
      const booking = await db.getBookingById(String(body.bookingId || ''));
      if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

      const status = await settlePayment(booking, {
        id: body.paymentId || `pay_mock_${crypto.randomBytes(5).toString('hex')}`,
        order_id: booking.razorpay_order_id || '',
        status: 'captured',
        amount: toPaise(booking.total_amount),
        currency: 'INR',
      }, 'mock');
      return NextResponse.json({ received: true, status });
    }

    if (!webhookSecret) {
      return NextResponse.json({ error: 'Razorpay webhook secret not configured' }, { status: 503 });
    }

    // ── Live Razorpay webhook ──
    const signature = req.headers.get('x-razorpay-signature');
    if (!signature || !signatureMatches(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Razorpay sends the event id in a header, not in the body
    const eventId = req.headers.get('x-razorpay-event-id')
      || `body_${crypto.createHash('sha256').update(rawBody).digest('hex')}`;

    if (await db.hasProcessedWebhookEvent(eventId)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const event = JSON.parse(rawBody);
    if (!HANDLED_EVENTS.has(event.event)) {
      return NextResponse.json({ received: true, ignored: event.event });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment?.id || !payment?.order_id) {
      return NextResponse.json({ received: true, ignored: 'no payment entity' });
    }

    // The booking is found by OUR order id only. Payment notes are set by the
    // payer's browser and are never trusted.
    const booking = await db.getBookingByOrderId(payment.order_id);
    if (!booking) {
      console.warn(`Webhook for unknown order ${payment.order_id} (payment ${payment.id})`);
      await db.recordWebhookEvent(eventId);
      return NextResponse.json({ received: true, ignored: 'unknown order' });
    }

    const status = await settlePayment(booking, payment, 'webhook');

    // Recorded only after the work succeeded, so a failure is retried by Razorpay
    await db.recordWebhookEvent(eventId);
    return NextResponse.json({ received: true, status });
  } catch (err) {
    console.error('Webhook execution error:', err);
    // 500 makes Razorpay retry the delivery
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
