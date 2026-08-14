import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const lookupSchema = z.object({
  phone: z.string().min(5).max(20),
});

/**
 * POST /api/bookings/lookup
 * Retrieves bookings by customer phone number.
 * This enables anonymous (guest) users to retrieve their tickets
 * without needing an account — phone is the universal identifier.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = lookupSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: 'Please provide a valid phone number.' }, { status: 400 });
    }

    const { phone } = result.data;

    // Fetch all bookings and filter by phone (Supabase doesn't have a direct
    // customer_phone index, so we query and filter — fine for a small cinema)
    const allBookings = await db.getBookings();
    
    // Normalize phone: strip spaces, dashes, leading +91/0
    const normalizePhone = (p: string) => p.replace(/[\s\-\+]/g, '').replace(/^(91|0)/, '');
    const normalizedInput = normalizePhone(phone);
    
    const matchedBookings = allBookings.filter((b: any) => {
      if (!b.customer_phone) return false;
      return normalizePhone(b.customer_phone) === normalizedInput;
    });

    // Return all paid/confirmed bookings
    const confirmedBookings = matchedBookings
      .filter((b: any) => b.payment_status === 'paid')
      .map((b: any) => ({
        id: b.id,
        movieTitle: b.show?.movie?.title || 'Movie',
        screenName: b.show?.screen?.name || 'Screen',
        showDate: b.show?.show_date || '—',
        showTime: b.show?.show_time || '—',
        customerName: b.customer_name,
        totalAmount: b.total_amount,
        bookingChannel: b.booking_channel,
        createdAt: b.created_at,
      }));

    return NextResponse.json({ bookings: confirmedBookings });
  } catch (err: any) {
    console.error('Booking lookup error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
