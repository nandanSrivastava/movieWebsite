import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestUser, readGuestId } from '@/lib/requestAuth';
import { seatLabel } from '@/features/shared/utils/format';

const MAX_TICKETS = 10;

/**
 * Tickets bought from this browser (its guest cookie) or account, for shows that
 * haven't ended. This is how a guest who gave no email and lost the tab gets back
 * to their ticket on the same phone. The cookie is httpOnly and unguessable, and
 * nothing here can be reached by phone number or booking id.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    const guestId = readGuestId(req.cookies.getAll());
    const owners = [user?.id, guestId].filter((id): id is string => !!id);

    const bookings = await db.findHolderTickets(owners, MAX_TICKETS);
    const tickets = bookings.map(b => ({
      id: b.id,
      accessKey: b.access_key,
      movieTitle: b.show?.movie?.title ?? 'Movie',
      showDate: b.show?.show_date,
      showTime: b.show?.show_time,
      seats: b.booking_seats?.map(bs => seatLabel(bs.seat_layout?.row_label, bs.seat_layout?.seat_number)).join(', ') ?? '',
    }));
    return NextResponse.json({ tickets }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('My tickets API error:', err);
    return NextResponse.json({ tickets: [] }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
