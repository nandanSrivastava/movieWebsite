import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

vi.mock('server-only', () => ({}));

const booking = {
  id: '11111111-1111-1111-1111-111111111111',
  show_id: 's1',
  booked_by: null,
  payment_status: 'pending',
  total_amount: 300,
  razorpay_order_id: 'order_ABC',
};

const db = vi.hoisted(() => ({
  isMock: false,
  getBookingByOrderId: vi.fn(),
  getBookingById: vi.fn(),
  finalizePayment: vi.fn(),
  queueRefund: vi.fn(),
  claimRefund: vi.fn(),
  logAudit: vi.fn(),
  hasProcessedWebhookEvent: vi.fn(),
  recordWebhookEvent: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db, isMockMode: false }));
vi.mock('@/lib/mailer', () => ({ queueTicketEmail: vi.fn() }));

import { POST } from '../src/app/api/checkout/webhook/route';

const secret = 'test_secret';

function webhookRequest(body: object, opts: { signature?: string | null; eventId?: string } = {}) {
  const payload = JSON.stringify(body);
  const signature = opts.signature === undefined
    ? crypto.createHmac('sha256', secret).update(payload).digest('hex')
    : opts.signature;
  const headers: Record<string, string> = { 'x-razorpay-event-id': opts.eventId || 'evt_1' };
  if (signature !== null) headers['x-razorpay-signature'] = signature;
  return new NextRequest('http://localhost/api/checkout/webhook', { method: 'POST', body: payload, headers });
}

const captured = (overrides: Record<string, unknown> = {}) => ({
  event: 'payment.captured',
  payload: {
    payment: {
      entity: { id: 'pay_1', order_id: 'order_ABC', status: 'captured', amount: 30000, currency: 'INR', notes: {}, ...overrides },
    },
  },
});

describe('Razorpay webhook', () => {
  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    vi.clearAllMocks();
    db.hasProcessedWebhookEvent.mockResolvedValue(false);
    db.getBookingByOrderId.mockResolvedValue({ ...booking });
    db.finalizePayment.mockResolvedValue('confirmed');
    db.claimRefund.mockResolvedValue(null);
    db.queueRefund.mockResolvedValue(true);
  });

  it('rejects a missing signature', async () => {
    const res = await POST(webhookRequest(captured(), { signature: null }));
    expect(res.status).toBe(400);
    expect(db.finalizePayment).not.toHaveBeenCalled();
  });

  it('rejects a forged signature', async () => {
    const res = await POST(webhookRequest(captured(), { signature: 'f'.repeat(64) }));
    expect(res.status).toBe(400);
    expect(db.finalizePayment).not.toHaveBeenCalled();
  });

  it('confirms a captured payment matched by order id, then records the header event id', async () => {
    const res = await POST(webhookRequest(captured(), { eventId: 'evt_header_42' }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('confirmed');
    expect(db.getBookingByOrderId).toHaveBeenCalledWith('order_ABC');
    expect(db.finalizePayment).toHaveBeenCalledWith(booking.id, 'pay_1', expect.stringMatching(/^tkt_/), 'refund_pending');
    expect(db.recordWebhookEvent).toHaveBeenCalledWith('evt_header_42');
  });

  it('ignores the booking id in payment notes (set by the payer)', async () => {
    db.getBookingByOrderId.mockResolvedValue(null);
    const res = await POST(webhookRequest(captured({ order_id: 'order_OTHER', notes: { bookingId: booking.id } })));
    expect(res.status).toBe(200);
    expect(db.getBookingById).not.toHaveBeenCalled();
    expect(db.finalizePayment).not.toHaveBeenCalled();
  });

  it('never confirms a payment for the wrong amount', async () => {
    const res = await POST(webhookRequest(captured({ amount: 15000 })));
    expect((await res.json()).status).toBe('refund_queued');
    expect(db.finalizePayment).not.toHaveBeenCalled();
    expect(db.queueRefund).toHaveBeenCalledWith(booking.id, 'pay_1', 'amount_mismatch');
  });

  it('skips an event it already processed', async () => {
    db.hasProcessedWebhookEvent.mockResolvedValue(true);
    const res = await POST(webhookRequest(captured()));
    expect((await res.json()).duplicate).toBe(true);
    expect(db.finalizePayment).not.toHaveBeenCalled();
  });

  it('returns 500 and does not record the event when processing fails, so Razorpay retries', async () => {
    db.finalizePayment.mockRejectedValue(new Error('db down'));
    const res = await POST(webhookRequest(captured()));
    expect(res.status).toBe(500);
    expect(db.recordWebhookEvent).not.toHaveBeenCalled();
  });

  it('queues a refund when the seats were sold before the payment arrived', async () => {
    db.finalizePayment.mockResolvedValue('conflict');
    const res = await POST(webhookRequest(captured()));
    expect((await res.json()).status).toBe('refund_queued');
    expect(db.claimRefund).toHaveBeenCalledWith(booking.id);
  });
});
