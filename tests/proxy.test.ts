import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';

const api = (path: string, origin: string | null) =>
  new NextRequest(`https://www.dhrubcineplex.in${path}`, {
    method: 'POST',
    headers: { host: 'www.dhrubcineplex.in', ...(origin ? { origin } : {}) },
  });

describe('API origin guard', () => {
  it('refuses a request from another site', async () => {
    expect((await proxy(api('/api/seats/lock', 'https://evil.example'))).status).toBe(403);
    expect((await proxy(api('/api/bookings/check-in', 'https://www.dhrubcineplex.in.evil.example'))).status).toBe(403);
  });

  it('refuses an origin that isn\'t a real address', async () => {
    expect((await proxy(api('/api/seats/lock', 'not a url'))).status).toBe(400);
  });

  it('allows the site itself, the mobile app, and requests with no origin', async () => {
    for (const origin of ['https://www.dhrubcineplex.in', 'capacitor://localhost', null]) {
      expect((await proxy(api('/api/seats/lock', origin))).status).toBe(200);
    }
  });

  it('lets Razorpay reach the webhook, which checks its own signature', async () => {
    expect((await proxy(api('/api/checkout/webhook', 'https://api.razorpay.com'))).status).toBe(200);
  });
});
