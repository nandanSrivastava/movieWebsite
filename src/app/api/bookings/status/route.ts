import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestUser } from '@/lib/requestAuth';
import { canViewBooking, ticketView } from '@/lib/bookingAccess';

export async function GET(req: NextRequest) {
  try {
    const bookingId = req.nextUrl.searchParams.get('bookingId');
    const accessKey = req.nextUrl.searchParams.get('k');

    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId parameter' }, { status: 400 });
    }

    const booking = await db.getBookingById(bookingId);
    const user = booking ? await getRequestUser(req) : null;

    if (!booking || !canViewBooking(booking, accessKey, user)) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const response = NextResponse.json(ticketView(booking));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('Booking status API error:', err);
    return NextResponse.json({ error: 'Could not load the booking' }, { status: 500 });
  }
}
