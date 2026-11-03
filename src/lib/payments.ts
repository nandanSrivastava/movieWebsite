import 'server-only';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { db } from './db';
import { queueRefundEmail, queueTicketEmail, sendExtraPaymentRefundEmail } from './mailer';
import type { Booking } from './types';

// How long an online booking may wait for a payment before it's abandoned.
// Covers the seat hold (max 25 min, see hold_limit_at) plus slow UPI approvals.
const ABANDON_AFTER_MS = 45 * 60 * 1000;

export const isRazorpayConfigured = () => !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;

let razorpay: Razorpay | null = null;
export function getRazorpay(): Razorpay {
  if (!razorpay) {
    razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });
  }
  return razorpay;
}

export const toPaise = (amount: number | string) => Math.round(Number(amount) * 100);

export const newQrToken = (bookingId: string) => `tkt_${bookingId}_${crypto.randomBytes(8).toString('hex')}`;

/** The fields we rely on from a Razorpay payment entity. */
export interface VerifiedPayment {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  currency: string;
}

export type SettleOutcome = 'confirmed' | 'already_paid' | 'refund_queued' | 'ignored';

/**
 * Applies a payment we trust (signature-checked webhook, or fetched from the
 * Razorpay API with our secret) to its booking. The booking is matched by
 * order id and the amount must be exactly what we charged.
 */
export async function settlePayment(
  booking: Booking,
  payment: VerifiedPayment,
  source: 'webhook' | 'verify' | 'reconcile' | 'mock'
): Promise<SettleOutcome> {
  if (payment.status !== 'captured') return 'ignored';

  if (!booking.razorpay_order_id || payment.order_id !== booking.razorpay_order_id) {
    console.error(`Payment ${payment.id} is for order ${payment.order_id}, not booking ${booking.id}'s order`);
    return 'ignored';
  }

  if (payment.amount !== toPaise(booking.total_amount) || payment.currency !== 'INR') {
    // Never confirm a ticket for the wrong amount; give the money back instead
    await db.logAudit(booking.booked_by, 'PAYMENT_AMOUNT_MISMATCH', {
      bookingId: booking.id, paymentId: payment.id, paid: payment.amount, expected: toPaise(booking.total_amount), source,
    });
    if (await db.queueRefund(booking.id, payment.id, 'amount_mismatch')) await processRefund(booking.id);
    return 'refund_queued';
  }

  const result = await db.finalizePayment(booking.id, payment.id, newQrToken(booking.id), 'refund_pending');

  switch (result) {
    case 'confirmed':
      await db.logAudit(booking.booked_by, 'PAYMENT_CONFIRMED', {
        bookingId: booking.id, orderId: payment.order_id, paymentId: payment.id, amount: booking.total_amount, source,
      });
      queueTicketEmail(booking.id);
      return 'confirmed';
    case 'already_paid':
      await refundIfExtraPayment(booking.id, payment, source);
      return 'already_paid';
    case 'refunding':
      // This booking's money is going back already. A different payment on it must too.
      await refundIfExtraPayment(booking.id, payment, source);
      return 'refund_queued';
    case 'conflict':
      // Seats went to someone else before this payment arrived
      await db.logAudit(booking.booked_by, 'PAYMENT_SEAT_CONFLICT', {
        bookingId: booking.id, orderId: payment.order_id, paymentId: payment.id, source,
      });
      await processRefund(booking.id);
      return 'refund_queued';
    default:
      return 'ignored';
  }
}

/**
 * A booking keeps the payment that confirmed it. Any other captured payment on
 * it (a late UPI approval after a retry, or a cash sale while an online window
 * was still open) is money the customer shouldn't have paid, so it goes back.
 * Throws if the refund fails, so a webhook delivery is retried.
 */
async function refundIfExtraPayment(bookingId: string, payment: VerifiedPayment, source: string) {
  const booking = await db.getBookingById(bookingId);
  if (!booking?.razorpay_payment_id || booking.razorpay_payment_id === payment.id) return;
  if (!isRazorpayConfigured() || payment.id.startsWith('pay_mock_')) return;

  const rz = getRazorpay();
  const current: any = await rz.payments.fetch(payment.id);
  const due = Number(current.amount) - Number(current.amount_refunded || 0);
  if (due <= 0 || current.status !== 'captured') return;

  await db.logAudit(booking.booked_by, 'PAYMENT_EXTRA_RECEIVED', { bookingId, paymentId: payment.id, amount: due, source });
  const refund = await rz.payments.refund(payment.id, { amount: due, notes: { bookingId, reason: 'duplicate_payment' } });
  await db.logAudit(booking.booked_by, 'PAYMENT_EXTRA_REFUNDED', { bookingId, paymentId: payment.id, refundId: refund.id, amount: due });
  sendExtraPaymentRefundEmail(booking, due / 100);
}

/**
 * Refunds a booking in the refund queue. Safe to call repeatedly and from
 * several places: a short claim prevents parallel refunds, and Razorpay's
 * own record of what was already refunded prevents double refunds.
 */
export async function processRefund(bookingId: string): Promise<'refunded' | 'retry_later' | 'not_due'> {
  const booking = await db.claimRefund(bookingId);
  if (!booking) return 'not_due';

  const paymentId = booking.razorpay_payment_id;
  if (!paymentId || paymentId.startsWith('pay_mock_') || !isRazorpayConfigured()) {
    if (db.isMock) {
      await db.completeRefund(bookingId, null);
      queueRefundEmail(bookingId);
      return 'refunded';
    }
    console.error(`Refund for booking ${bookingId} can't run: no payment id or Razorpay keys`);
    return 'retry_later';
  }

  try {
    const rz = getRazorpay();
    const payment: any = await rz.payments.fetch(paymentId);
    const due = Number(payment.amount) - Number(payment.amount_refunded || 0);

    if (due <= 0 || payment.status === 'refunded') {
      await db.completeRefund(bookingId, null);
      queueRefundEmail(bookingId);
      return 'refunded';
    }
    if (payment.status !== 'captured') {
      // Authorized but never captured: Razorpay releases it back to the customer itself
      await db.completeRefund(bookingId, null);
      await db.logAudit(booking.booked_by, 'PAYMENT_RELEASED_UNCAPTURED', { bookingId, paymentId, status: payment.status });
      return 'refunded';
    }

    const refund = await rz.payments.refund(paymentId, {
      amount: due,
      notes: { bookingId, reason: booking.refund_reason || 'seats_unavailable' },
    });
    await db.completeRefund(bookingId, refund.id);
    await db.logAudit(booking.booked_by, 'PAYMENT_REFUNDED', { bookingId, paymentId, refundId: refund.id, amount: due });
    queueRefundEmail(bookingId);
    return 'refunded';
  } catch (err: any) {
    console.error(`Refund failed for booking ${bookingId}:`, err);
    await db.logAudit(booking.booked_by, 'PAYMENT_REFUND_FAILED', {
      bookingId, paymentId, error: err?.error?.description || err?.message || 'unknown',
    });
    return 'retry_later';
  }
}

/**
 * Checks Razorpay for a booking that is still pending: confirms it if the
 * customer actually paid (missed webhook, closed tab), or abandons it once
 * it's too old to be paid.
 */
export async function reconcilePendingBooking(booking: Booking): Promise<SettleOutcome | 'abandoned' | 'waiting'> {
  const age = Date.now() - new Date(booking.created_at).getTime();
  const orderId = booking.razorpay_order_id;

  if (!orderId || !isRazorpayConfigured()) {
    if (age > ABANDON_AFTER_MS && (await db.expirePendingBooking(booking.id))) return 'abandoned';
    return 'waiting';
  }

  const rz = getRazorpay();
  const { items } = await rz.orders.fetchPayments(orderId);
  const payments = (items || []) as any[];

  let paid = payments.find(p => p.status === 'captured');
  const authorized = payments.find(p => p.status === 'authorized');
  if (!paid && authorized) {
    // Auto-capture is off or lagging: capture what the customer approved
    await rz.payments.capture(authorized.id, authorized.amount, authorized.currency);
    paid = { ...authorized, status: 'captured' };
  }

  if (paid) {
    const full = await db.getBookingById(booking.id);
    return full ? settlePayment(full, paid, 'reconcile') : 'ignored';
  }

  if (age > ABANDON_AFTER_MS && (await db.expirePendingBooking(booking.id))) return 'abandoned';
  return 'waiting';
}

/**
 * Before showing a customer the Pay button again: did their earlier attempt on
 * these seats actually go through? 'ticket' means there is a ticket or a refund
 * to show them instead. A Razorpay failure must not stop a sale, so it counts
 * as no news. The webhook and the reconcile job still catch up later.
 */
export async function checkEarlierAttempt(booking: Booking): Promise<'ticket' | 'pending' | 'none'> {
  if (booking.payment_status === 'paid' || booking.payment_status === 'refund_pending' || booking.payment_status === 'refunded') {
    return 'ticket';
  }
  if (booking.payment_status !== 'pending') return 'none';
  if (!booking.razorpay_order_id) return 'none';

  let outcome: Awaited<ReturnType<typeof reconcilePendingBooking>> = 'waiting';
  try {
    outcome = await reconcilePendingBooking(booking);
  } catch (err) {
    console.error(`Could not check the earlier payment for booking ${booking.id}:`, err);
  }
  if (outcome === 'confirmed' || outcome === 'already_paid' || outcome === 'refund_queued') return 'ticket';
  return outcome === 'abandoned' ? 'none' : 'pending';
}
