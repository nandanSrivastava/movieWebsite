import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestUser } from '@/lib/requestAuth';

/** Dashboard totals, counted from bookings in the database (not from audit logs). */
export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
    }

    const stats = await db.getSalesSummary();

    const response = NextResponse.json({ stats });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('Fetch admin stats API error:', err);
    return NextResponse.json({ error: 'Could not load stats' }, { status: 500 });
  }
}
