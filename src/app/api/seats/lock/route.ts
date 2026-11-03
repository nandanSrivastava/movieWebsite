import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp, getHoldOwner, setGuestCookie } from '@/lib/requestAuth';

const lockRequestSchema = z.object({
  showId: z.string().min(1).max(100),
  seatLayoutIds: z.array(z.string().min(1).max(100)).min(1).max(10)
    .refine(ids => new Set(ids).size === ids.length, 'Duplicate seats'),
});

const HOLD_MS = 8 * 60 * 1000;

const LOCK_ERRORS: Record<string, { status: number; error: string }> = {
  taken: { status: 409, error: 'One or more selected seats were just taken by another customer. Please pick different seats.' },
  hold_limit: { status: 429, error: "You've held seats for the longest time allowed, so they've gone back on sale. Please try again in about 10 minutes." },
  ip_cap: { status: 429, error: 'Too many seats are being held from your network right now. Please try again in a few minutes.' },
  show_started: { status: 400, error: 'Cannot book seats for a show that has already started or is in the past.' },
  invalid: { status: 400, error: 'Those seats are not available for this show.' },
};

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await rateLimit(`lock:${ip || 'unknown'}`, 20, 60, 'Too many seat requests. Please wait a minute before trying again.');
    if (limited) {
      // Vercel's logs show how often real customers on a shared network hit this
      console.warn(`Seat request limit reached for network ${ip || 'unknown'}`);
      return limited;
    }

    const result = lockRequestSchema.safeParse(await req.json().catch(() => null));
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid inputs' }, { status: 400 });
    }
    const { showId, seatLayoutIds } = result.data;

    // Signed-in user, or a guest id the server issues in an httpOnly cookie
    const { owner, user, newGuestId } = await getHoldOwner(req, true);

    // lock_seats also refuses shows that have started, so this is one round trip
    const outcome = await db.lockSeats(showId, seatLayoutIds, owner!, ip);
    if (outcome !== 'ok') {
      // The owner's evidence for whether 24 seats per network is the right limit
      if (outcome === 'ip_cap') {
        after(() => db.logAudit(user?.id ?? null, 'SEAT_HOLD_NETWORK_LIMIT', { showId, seatLayoutIds }, ip || undefined)
          .catch(err => console.error('Network limit audit failed:', err)));
      }
      const { status, error } = LOCK_ERRORS[outcome] || LOCK_ERRORS.invalid;
      const response = NextResponse.json({ success: false, reason: outcome, error }, { status });
      if (newGuestId) setGuestCookie(response, newGuestId);
      return response;
    }

    // Holds last 8 minutes (lock_seats); the client only uses this for display
    const expiresAt = new Date(Date.now() + HOLD_MS).toISOString();

    after(() => db.logAudit(user?.id ?? null, 'SEAT_LOCK', { showId, seatLayoutIds, guest: !user }, ip || undefined)
      .catch(err => console.error('Seat lock audit failed:', err)));

    const response = NextResponse.json({ success: true, expiresAt });
    if (newGuestId) setGuestCookie(response, newGuestId);
    return response;
  } catch (err) {
    console.error('Seat lock API error:', err);
    return NextResponse.json({ error: 'Could not hold seats right now. Please try again.' }, { status: 500 });
  }
}
