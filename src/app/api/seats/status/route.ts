import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Public seat map: seat id + available/locked/booked, nothing about who holds
 * or bought a seat. Identical for every viewer, so the CDN serves it for a few
 * seconds and hundreds of open seat maps cost about one database read per show.
 */
export async function GET(req: NextRequest) {
  try {
    const showId = req.nextUrl.searchParams.get('showId');
    if (!showId || showId.length > 100) {
      return NextResponse.json({ error: 'Missing showId parameter' }, { status: 400 });
    }

    const seats = await db.getSeatAvailability(showId);

    const response = NextResponse.json({ seats });
    response.headers.set('Cache-Control', 'public, max-age=0, s-maxage=3, stale-while-revalidate=5');
    return response;
  } catch (err) {
    console.error('Seat status retrieval error:', err);
    return NextResponse.json({ error: 'Seat map unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
