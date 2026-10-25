import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffUser } from '@/lib/requestAuth';

const SEARCH_LIMIT = 10;

export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffUser(req);
    if (!staff) {
      return NextResponse.json({ error: 'Forbidden: Only counter staff and administrators can verify tickets.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const input = (searchParams.get('token') || '').trim();

    if (!input) {
      return NextResponse.json({ error: 'Missing token parameter' }, { status: 400 });
    }

    // 1. Exact ticket: a scanned QR token (tkt_...) or the booking ID printed on the ticket.
    //    Only an exact match counts; partial tokens never verify a ticket.
    const booking = input.startsWith('tkt_')
      ? await db.getBookingByQrToken(input)
      : await db.getBookingById(input);

    if (booking) {
      if (booking.payment_status !== 'paid') {
        return NextResponse.json({
          verified: false,
          error: `Ticket payment is pending or incomplete. Current Status: ${booking.payment_status}`
        }, { status: 400 });
      }
      return noStore({ verified: true, booking });
    }

    if (input.startsWith('tkt_')) {
      return NextResponse.json({ verified: false, error: 'Ticket not found in the cinema registry.' }, { status: 404 });
    }

    // 2. Search by phone or customer name. Returns every paid match so staff
    //    can pick the right customer; nothing is admitted from a search.
    const phoneCandidate = input.replace(/[\s\-+()]/g, '');
    let matches;

    if (/^\d+$/.test(phoneCandidate)) {
      if (phoneCandidate.length < 4) {
        return NextResponse.json({ error: 'Enter at least 4 digits of the phone number.' }, { status: 400 });
      }
      // A full number may carry a 91 / 0 prefix; the last 10 digits are the subscriber number
      const phoneDigits = phoneCandidate.length > 10 ? phoneCandidate.slice(-10) : phoneCandidate;
      matches = await db.searchPaidBookings({ phoneDigits }, SEARCH_LIMIT);
    } else {
      if (input.length < 3) {
        return NextResponse.json({ error: 'Enter at least 3 letters of the customer name.' }, { status: 400 });
      }
      matches = await db.searchPaidBookings({ name: input }, SEARCH_LIMIT);
    }

    if (matches.length === 0) {
      return NextResponse.json({ verified: false, error: 'No paid tickets match that phone number or name.' }, { status: 404 });
    }

    return noStore({ matches });

  } catch (err) {
    console.error('Verify booking API error:', err);
    return NextResponse.json({ error: 'Could not check the ticket right now' }, { status: 500 });
  }
}

function noStore(body: unknown) {
  const response = NextResponse.json(body);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
