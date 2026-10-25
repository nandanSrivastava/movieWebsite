import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getClientIp, getHoldOwner } from '@/lib/requestAuth';

const unlockRequestSchema = z.object({
  showId: z.string().min(1).max(100),
  seatLayoutIds: z.array(z.string().min(1).max(100)).min(1).max(200),
  // Staff only: release holds that belong to someone else (never touches sold seats)
  force: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const result = unlockRequestSchema.safeParse(await req.json().catch(() => null));
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid inputs' }, { status: 400 });
    }
    const { showId, seatLayoutIds, force } = result.data;

    const { owner, user } = await getHoldOwner(req, false);

    if (force) {
      if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
      }
      await db.forceReleaseSeatHolds(showId, seatLayoutIds);
      await db.logAudit(user.id, 'SEAT_FORCE_RELEASE', { showId, seatLayoutIds }, getClientIp(req) || undefined);
      return NextResponse.json({ success: true });
    }

    if (!owner) {
      return NextResponse.json({ error: 'No seat hold to release.' }, { status: 401 });
    }

    // Only the caller's own holds are released
    await db.releaseSeatHolds(showId, seatLayoutIds, owner);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Seat unlock API error:', err);
    return NextResponse.json({ error: 'Could not release seats right now.' }, { status: 500 });
  }
}
