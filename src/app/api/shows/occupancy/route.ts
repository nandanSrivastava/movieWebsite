import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const MAX_SHOWS = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Booked and total seats for the shows on one movie page, and nothing else.
 * Polled while the page is open, so it stays tiny, and identical for everyone
 * so the CDN answers most of it.
 */
export async function GET(req: NextRequest) {
  try {
    const ids = (req.nextUrl.searchParams.get('ids') || '').split(',').filter(id => UUID_RE.test(id)).slice(0, MAX_SHOWS);
    const occupancy = await db.getShowOccupancy(ids);
    return NextResponse.json({ occupancy }, {
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('Show occupancy API error:', err);
    return NextResponse.json({ error: 'Could not load availability' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
