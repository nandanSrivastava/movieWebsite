import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/requestAuth';
import { sendTicketLookupEmails } from '@/lib/mailer';

const lookupSchema = z.object({
  phone: z.string().min(10).max(20),
});

const GENERIC_REPLY = {
  ok: true,
  message: "If there are tickets booked with this number and an email address on file, we've just emailed them there. No email on file? Show your phone number at the counter and staff will find your booking.",
};

/**
 * POST /api/bookings/lookup
 * Guests who lost their ticket link get it re-sent to the email used at
 * booking. Nothing about the booking is returned here: a phone number alone
 * must never reveal someone's ticket or name.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req) || 'unknown';
    const limitedIp = await rateLimit(`lookup:ip:${ip}`, 5, 600, 'Too many lookups. Please try again in 10 minutes.');
    if (limitedIp) return limitedIp;

    const result = lookupSchema.safeParse(await req.json().catch(() => null));
    const digits = result.success ? result.data.phone.replace(/\D/g, '') : '';
    if (digits.length < 10) {
      return NextResponse.json({ error: 'Please enter your full 10-digit mobile number.' }, { status: 400 });
    }
    // Last 10 digits = the subscriber number, whatever prefix was typed or stored
    const phoneDigits = digits.slice(-10);

    const limitedPhone = await rateLimit(`lookup:phone:${phoneDigits}`, 3, 3600, 'Tickets for this number were sent recently. Please check your email.');
    if (limitedPhone) return limitedPhone;

    // Send after responding, so the reply looks the same whether or not tickets exist
    after(async () => {
      try {
        const bookings = await db.findPaidBookingsByPhone(phoneDigits, 20);
        if (bookings.length > 0) await sendTicketLookupEmails(bookings);
      } catch (err) {
        console.error('Booking lookup email error:', err);
      }
    });

    return NextResponse.json(GENERIC_REPLY);
  } catch (err) {
    console.error('Booking lookup error:', err);
    return NextResponse.json({ error: 'Lookup is unavailable right now.' }, { status: 500 });
  }
}
