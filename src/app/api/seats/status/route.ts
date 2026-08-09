import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const showId = searchParams.get('showId');

    if (!showId) {
      return NextResponse.json({ error: 'Missing showId parameter' }, { status: 400 });
    }

    const seats = await db.getSeatsForShow(showId);

    // Disable caching so clients always read fresh data
    const response = NextResponse.json({ seats });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    
    return response;
  } catch (err: any) {
    console.error('Seat status retrieval error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
