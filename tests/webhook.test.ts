import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { POST } from '../src/app/api/checkout/webhook/route';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  db: {
    getBookingById: vi.fn().mockResolvedValue({ id: 'b1', show_id: 's1', booked_by: 'u1', payment_status: 'pending', total_amount: 100 }),
    confirmBooking: vi.fn().mockResolvedValue(true),
    finalizeBooking: vi.fn().mockResolvedValue(true),
    logAudit: vi.fn().mockResolvedValue(true),
    updateBookingStatus: vi.fn().mockResolvedValue(true),
  },
  isMockMode: false
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null })
    }),
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'test@example.com' } } })
      }
    }
  })
}));

describe('Webhook API', () => {
  const webhookSecret = 'test_secret';

  it('rejects missing signature', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    const req = new NextRequest('http://localhost/api/checkout/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_1', event: 'payment.captured' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing signature header');
  });

  it('rejects forged signature', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    const payload = JSON.stringify({ id: 'evt_1', event: 'payment.captured' });
    const req = new NextRequest('http://localhost/api/checkout/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'x-razorpay-signature': 'invalid_signature' }
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid signature verification failed');
  });

  it('accepts valid signature', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    const payload = JSON.stringify({ 
      id: 'evt_1', 
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', notes: { bookingId: 'b1' } } } }
    });
    const signature = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    const req = new NextRequest('http://localhost/api/checkout/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'x-razorpay-signature': signature }
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('confirmed');
  });
});
