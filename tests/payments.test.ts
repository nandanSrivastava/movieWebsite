import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const db = vi.hoisted(() => ({
  isMock: false,
  finalizePayment: vi.fn(),
  queueRefund: vi.fn(),
  claimRefund: vi.fn(),
  completeRefund: vi.fn(),
  expirePendingBooking: vi.fn(),
  getBookingById: vi.fn(),
  logAudit: vi.fn(),
}));

const rz = vi.hoisted(() => ({
  orders: { fetchPayments: vi.fn() },
  payments: { fetch: vi.fn(), refund: vi.fn(), capture: vi.fn() },
}));

const mail = vi.hoisted(() => ({ queueTicketEmail: vi.fn(), queueRefundEmail: vi.fn(), sendExtraPaymentRefundEmail: vi.fn() }));

vi.mock('@/lib/db', () => ({ db, isMockMode: false }));
vi.mock('@/lib/mailer', () => mail);
vi.mock('razorpay', () => ({ default: vi.fn(function () { return rz; }) }));

import { checkEarlierAttempt, processRefund, reconcilePendingBooking, settlePayment } from '../src/lib/payments';
import type { Booking } from '../src/lib/types';

const booking = (overrides: Partial<Booking> = {}) => ({
  id: 'b1',
  booked_by: null,
  payment_status: 'pending',
  total_amount: 300,
  razorpay_order_id: 'order_1',
  created_at: new Date().toISOString(),
  ...overrides,
}) as unknown as Booking;

const payment = (overrides = {}) => ({ id: 'pay_1', order_id: 'order_1', status: 'captured', amount: 30000, currency: 'INR', ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
  process.env.RAZORPAY_KEY_SECRET = 'secret';
  db.finalizePayment.mockResolvedValue('confirmed');
  db.queueRefund.mockResolvedValue(true);
  db.claimRefund.mockResolvedValue(null);
  db.expirePendingBooking.mockResolvedValue(true);
  db.getBookingById.mockResolvedValue(booking());
  rz.orders.fetchPayments.mockResolvedValue({ items: [] });
  rz.payments.refund.mockResolvedValue({ id: 'rfnd_1' });
});

describe('settlePayment', () => {
  it('confirms a captured payment of the right amount and sends the ticket', async () => {
    expect(await settlePayment(booking(), payment(), 'webhook')).toBe('confirmed');
    expect(mail.queueTicketEmail).toHaveBeenCalledWith('b1');
  });

  it('never issues a ticket for a payment that wasn\'t captured', async () => {
    expect(await settlePayment(booking(), payment({ status: 'authorized' }), 'webhook')).toBe('ignored');
    expect(db.finalizePayment).not.toHaveBeenCalled();
  });

  it('never accepts a payment made on another order', async () => {
    expect(await settlePayment(booking(), payment({ order_id: 'order_2' }), 'webhook')).toBe('ignored');
    expect(db.finalizePayment).not.toHaveBeenCalled();
  });

  it('sends the wrong amount back instead of issuing a ticket', async () => {
    expect(await settlePayment(booking(), payment({ amount: 100 }), 'webhook')).toBe('refund_queued');
    expect(db.finalizePayment).not.toHaveBeenCalled();
    expect(db.queueRefund).toHaveBeenCalledWith('b1', 'pay_1', 'amount_mismatch');
  });

  it('refunds when the seats went to someone else', async () => {
    db.finalizePayment.mockResolvedValue('conflict');
    expect(await settlePayment(booking(), payment(), 'webhook')).toBe('refund_queued');
    expect(db.claimRefund).toHaveBeenCalledWith('b1');
  });
});

describe('a second payment on a paid booking', () => {
  beforeEach(() => {
    db.finalizePayment.mockResolvedValue('already_paid');
    db.getBookingById.mockResolvedValue(booking({ payment_status: 'paid', razorpay_payment_id: 'pay_first' } as Partial<Booking>));
  });

  it('goes back to the customer, and they\'re told', async () => {
    rz.payments.fetch.mockResolvedValue({ status: 'captured', amount: 30000, amount_refunded: 0 });
    expect(await settlePayment(booking(), payment({ id: 'pay_second' }), 'webhook')).toBe('already_paid');
    expect(rz.payments.refund).toHaveBeenCalledWith('pay_second', expect.objectContaining({ amount: 30000 }));
    expect(mail.sendExtraPaymentRefundEmail).toHaveBeenCalled();
    expect(db.logAudit).toHaveBeenCalledWith(null, 'PAYMENT_EXTRA_REFUNDED', expect.anything());
  });

  it('leaves the payment that bought the ticket alone (webhook sent twice)', async () => {
    expect(await settlePayment(booking(), payment({ id: 'pay_first' }), 'webhook')).toBe('already_paid');
    expect(rz.payments.refund).not.toHaveBeenCalled();
  });

  it('doesn\'t refund twice', async () => {
    rz.payments.fetch.mockResolvedValue({ status: 'captured', amount: 30000, amount_refunded: 30000 });
    await settlePayment(booking(), payment({ id: 'pay_second' }), 'webhook');
    expect(rz.payments.refund).not.toHaveBeenCalled();
  });

  it('throws if the refund fails, so the webhook is retried', async () => {
    rz.payments.fetch.mockResolvedValue({ status: 'captured', amount: 30000, amount_refunded: 0 });
    rz.payments.refund.mockRejectedValue(new Error('razorpay down'));
    await expect(settlePayment(booking(), payment({ id: 'pay_second' }), 'webhook')).rejects.toThrow('razorpay down');
  });
});

describe('another payment on a booking already being refunded', () => {
  beforeEach(() => {
    db.finalizePayment.mockResolvedValue('refunding');
    db.getBookingById.mockResolvedValue(booking({ payment_status: 'refund_pending', razorpay_payment_id: 'pay_first' } as Partial<Booking>));
  });

  it('goes back too: no money is kept with no ticket', async () => {
    rz.payments.fetch.mockResolvedValue({ status: 'captured', amount: 30000, amount_refunded: 0 });
    expect(await settlePayment(booking(), payment({ id: 'pay_second' }), 'webhook')).toBe('refund_queued');
    expect(rz.payments.refund).toHaveBeenCalledWith('pay_second', expect.objectContaining({ amount: 30000 }));
  });

  it('leaves the payment already in the refund queue to that queue', async () => {
    expect(await settlePayment(booking(), payment({ id: 'pay_first' }), 'webhook')).toBe('refund_queued');
    expect(rz.payments.refund).not.toHaveBeenCalled();
  });
});

describe('processRefund', () => {
  const claimed = booking({ payment_status: 'refund_pending', razorpay_payment_id: 'pay_1' } as Partial<Booking>);

  it('refunds what is still due, then tells the customer', async () => {
    db.claimRefund.mockResolvedValue(claimed);
    rz.payments.fetch.mockResolvedValue({ status: 'captured', amount: 30000, amount_refunded: 10000 });
    expect(await processRefund('b1')).toBe('refunded');
    expect(rz.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 20000 }));
    expect(mail.queueRefundEmail).toHaveBeenCalledWith('b1');
  });

  it('never refunds again what Razorpay already refunded', async () => {
    db.claimRefund.mockResolvedValue(claimed);
    rz.payments.fetch.mockResolvedValue({ status: 'refunded', amount: 30000, amount_refunded: 30000 });
    expect(await processRefund('b1')).toBe('refunded');
    expect(rz.payments.refund).not.toHaveBeenCalled();
  });

  it('leaves it in the queue when Razorpay fails, and says nothing to the customer yet', async () => {
    db.claimRefund.mockResolvedValue(claimed);
    rz.payments.fetch.mockRejectedValue(new Error('razorpay down'));
    expect(await processRefund('b1')).toBe('retry_later');
    expect(db.completeRefund).not.toHaveBeenCalled();
    expect(mail.queueRefundEmail).not.toHaveBeenCalled();
  });

  it('does nothing when another worker holds the claim', async () => {
    expect(await processRefund('b1')).toBe('not_due');
    expect(rz.payments.fetch).not.toHaveBeenCalled();
  });
});

describe('reconcilePendingBooking', () => {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

  it('keeps waiting while a slow UPI approval could still arrive', async () => {
    expect(await reconcilePendingBooking(booking({ created_at: ago(44) }))).toBe('waiting');
    expect(db.expirePendingBooking).not.toHaveBeenCalled();
  });

  it('abandons a booking nobody paid for after 45 minutes', async () => {
    expect(await reconcilePendingBooking(booking({ created_at: ago(46) }))).toBe('abandoned');
  });

  it('confirms a payment the webhook missed', async () => {
    rz.orders.fetchPayments.mockResolvedValue({ items: [payment()] });
    expect(await reconcilePendingBooking(booking())).toBe('confirmed');
  });

  it('captures what the customer approved if capture is lagging', async () => {
    rz.orders.fetchPayments.mockResolvedValue({ items: [payment({ status: 'authorized' })] });
    expect(await reconcilePendingBooking(booking())).toBe('confirmed');
    expect(rz.payments.capture).toHaveBeenCalledWith('pay_1', 30000, 'INR');
  });
});

describe('checkEarlierAttempt: is there a ticket to show instead of a Pay button?', () => {
  it('yes, for a paid booking or one with a refund, without asking Razorpay', async () => {
    for (const payment_status of ['paid', 'refund_pending', 'refunded'] as const) {
      expect(await checkEarlierAttempt(booking({ payment_status }))).toBe('ticket');
    }
    expect(rz.orders.fetchPayments).not.toHaveBeenCalled();
  });

  it('yes, when Razorpay says the money arrived and our records hadn\'t caught up', async () => {
    rz.orders.fetchPayments.mockResolvedValue({ items: [payment()] });
    expect(await checkEarlierAttempt(booking())).toBe('ticket');
  });

  it('not yet, when nothing has arrived', async () => {
    expect(await checkEarlierAttempt(booking())).toBe('pending');
  });

  it('not yet, when Razorpay can\'t be reached: that must not stop a sale or show an error', async () => {
    rz.orders.fetchPayments.mockRejectedValue(new Error('razorpay down'));
    expect(await checkEarlierAttempt(booking())).toBe('pending');
  });

  it('no, when no order was ever made, or the booking is dead', async () => {
    expect(await checkEarlierAttempt(booking({ razorpay_order_id: null }))).toBe('none');
    expect(await checkEarlierAttempt(booking({ payment_status: 'failed' }))).toBe('none');
  });
});
