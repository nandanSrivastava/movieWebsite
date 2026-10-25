import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getStaffUser } from '@/lib/requestAuth';
import { checkInWindow } from '@/lib/istDate';

const checkInSchema = z.object({
  bookingId: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const staff = await getStaffUser(req);
    if (!staff) {
      return NextResponse.json({ error: 'Forbidden: Only counter staff and administrators can admit tickets.' }, { status: 403 });
    }

    const result = checkInSchema.safeParse(await req.json().catch(() => null));
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid inputs' }, { status: 400 });
    }

    const booking = await db.getBookingById(result.data.bookingId);
    if (!booking) {
      return NextResponse.json({ error: 'Ticket not found in the cinema registry.' }, { status: 404 });
    }

    if (booking.payment_status !== 'paid') {
      return NextResponse.json({ error: `Ticket payment is pending or incomplete. Current Status: ${booking.payment_status}` }, { status: 400 });
    }

    // Entry opens 3h before the show and closes 4h after it starts, so shows
    // after midnight work too (a calendar-date check refused them)
    const window = booking.show ? checkInWindow(booking.show.show_date, booking.show.show_time) : 'closed';
    if (window !== 'open') {
      const when = booking.show ? `${booking.show.show_date} ${booking.show.show_time.slice(0, 5)}` : 'another';
      const error = window === 'too_early'
        ? `Too early: this ticket is for the ${when} show. Entry opens 3 hours before.`
        : `This ticket was for the ${when} show, which has ended.`;
      return NextResponse.json({ error, booking }, { status: 400 });
    }

    const admitted = await db.checkInBooking(booking.id, staff.id);
    const latest = (await db.getBookingById(booking.id)) ?? booking;

    if (!admitted) {
      return NextResponse.json({ error: 'This ticket has already been used for entry.', booking: latest }, { status: 409 });
    }

    await db.logAudit(staff.id, 'TICKET_CHECKED_IN', { bookingId: booking.id, showId: booking.show_id });

    const response = NextResponse.json({ booking: latest });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('Ticket check-in API error:', err);
    return NextResponse.json({ error: 'Could not admit the ticket right now' }, { status: 500 });
  }
}
