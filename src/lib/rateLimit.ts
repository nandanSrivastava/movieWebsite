import 'server-only';
import { NextResponse } from 'next/server';
import { db } from './db';

/**
 * Durable rate limit shared by every server instance (backed by the
 * rate_limits table). Returns a 429 response when the caller is over the
 * limit, or null to carry on. Fails open if the database can't be reached,
 * so a limiter hiccup never blocks a paying customer.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  message = 'Too many requests. Please wait a minute and try again.'
): Promise<NextResponse | null> {
  try {
    const allowed = await db.rateLimitHit(key, windowSeconds, limit);
    if (allowed) return null;
  } catch (err) {
    console.error('Rate limiter unavailable, allowing request:', err);
    return null;
  }

  return NextResponse.json({ error: message }, {
    status: 429,
    headers: { 'Retry-After': String(windowSeconds) },
  });
}
