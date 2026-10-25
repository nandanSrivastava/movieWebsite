import 'server-only';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { db } from './db';
import { queueTicketEmail } from './mailer';
import type { Booking } from './types';

// How long an online booking may wait for a payment before it's abandoned.
// Covers the seat hold (max 20 min) plus slow UPI approvals.
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
      return 'already_paid';
    case 'refunding':
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
