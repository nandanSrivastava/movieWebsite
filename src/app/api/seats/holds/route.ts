import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getHoldOwner } from '@/lib/requestAuth';

/**
 * The caller's own seat holds for a show (seat map restores them after
 * "Back" from checkout). Kept separate so the seat map page itself can be
 * cached and shared by everyone.
 */
export async function GET(req: NextRequest) {
  const showId = req.nextUrl.searchParams.get('showId');
  if (!showId || showId.length > 100) {
    return NextResponse.json({ error: 'Missing showId parameter' }, { status: 400 });
  }

  try {
    const { owner } = await getHoldOwner(req, false);
    const holds = owner ? await db.getSeatHolds(showId, owner) : [];
    return NextResponse.json(
      { seatLayoutIds: holds.map(h => h.seat_layout_id) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('Seat holds API error:', err);
    return NextResponse.json({ seatLayoutIds: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
}
