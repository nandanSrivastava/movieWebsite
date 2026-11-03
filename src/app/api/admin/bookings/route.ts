import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestUser } from '@/lib/requestAuth';
import { istDateString } from '@/lib/istDate';
import { summarizeBookings } from '@/features/admin/utils/bookingTotals';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The owner's day-end view: every paid or refunded booking for one show date, with totals. */
export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
    }

    const requested = req.nextUrl.searchParams.get('date');
    if (requested && !ISO_DATE_RE.test(requested)) {
      return NextResponse.json({ error: 'Dates must look like 2026-11-05' }, { status: 400 });
    }
    const date = requested || istDateString();

    const bookings = await db.getBookingsForShowDate(date);
    const response = NextResponse.json({ date, bookings, totals: summarizeBookings(bookings) });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('Admin bookings API error:', err);
    return NextResponse.json({ error: 'Could not load bookings' }, { status: 500 });
  }
}
