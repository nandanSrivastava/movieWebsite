import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { processRefund, reconcilePendingBooking } from '@/lib/payments';
import { deliverTicketEmail } from '@/lib/mailer';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Stop starting new work after this, so the run finishes inside maxDuration
const TIME_BUDGET_MS = 45_000;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(req.headers.get('authorization') || '');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/**
 * Safety net, run every 5 minutes by Supabase pg_cron (see
 * supabase/migrations/003_scheduled_jobs.sql):
 *   1. pending bookings: confirm if the customer actually paid, abandon if stale
 *   2. refund queue: retry refunds that failed
 *   3. ticket emails: send any that failed
 */
async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;
  const summary = { pending: {} as Record<string, number>, refunds: {} as Record<string, number>, emails: {} as Record<string, number>, errors: 0 };
  const count = (bucket: Record<string, number>, key: string) => { bucket[key] = (bucket[key] || 0) + 1; };

  // Give the browser fallback and webhook a few minutes before stepping in
  for (const booking of await db.getPendingOnlineBookings(3 * 60, 25)) {
    if (outOfTime()) break;
    try {
      count(summary.pending, await reconcilePendingBooking(booking));
    } catch (err) {
      summary.errors++;
      console.error(`Reconcile failed for booking ${booking.id}:`, err);
    }
  }

  for (const booking of await db.getRefundPendingBookings(10)) {
    if (outOfTime()) break;
    count(summary.refunds, await processRefund(booking.id));
  }

  for (const booking of await db.getUnsentTicketEmailBookings(20)) {
    if (outOfTime()) break;
    count(summary.emails, await deliverTicketEmail(booking.id));
  }

  if (summary.errors > 0 || summary.refunds.retry_later) {
    console.error('Reconcile run finished with problems:', JSON.stringify(summary));
  }
  return NextResponse.json({ ok: true, tookMs: Date.now() - started, ...summary });
}

export const GET = run;
export const POST = run;
