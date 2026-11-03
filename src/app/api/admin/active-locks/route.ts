import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestUser } from '@/lib/requestAuth';

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
    }

    // One query for every live hold, instead of one query per show
    const activeLocks = await db.getActiveLocks();

    const response = NextResponse.json({ activeLocks });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('Fetch active locks API error:', err);
    return NextResponse.json({ error: 'Could not load active holds' }, { status: 500 });
  }
}
