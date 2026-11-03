import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffUser } from '@/lib/requestAuth';
import { istDateString } from '@/lib/istDate';

// The screen says so when there are more; search finds any ticket
const LIST_LIMIT = 200;

export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffUser(req);
    if (!staff) {
      return NextResponse.json({ error: 'Forbidden: Counter staff access required.' }, { status: 403 });
    }

    // Paid bookings for today's shows, newest first, for the gate quick-check list
    const bookings = await db.getPaidBookingsForShowDate(istDateString(), LIST_LIMIT + 1);

    const response = NextResponse.json({ bookings: bookings.slice(0, LIST_LIMIT), hasMore: bookings.length > LIST_LIMIT });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('Error fetching counter bookings:', err);
    return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
  }
}
