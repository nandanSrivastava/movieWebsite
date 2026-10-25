import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffUser } from '@/lib/requestAuth';
import { istDateString } from '@/lib/istDate';

export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffUser(req);
    if (!staff) {
      return NextResponse.json({ error: 'Forbidden: Counter staff access required.' }, { status: 403 });
    }

    // Paid bookings for today's shows, newest first, for the gate quick-check list
    const bookings = await db.getPaidBookingsForShowDate(istDateString(), 50);

    const response = NextResponse.json({ bookings });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('Error fetching counter bookings:', err);
    return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
  }
}
