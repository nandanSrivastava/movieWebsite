import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestUser } from '@/lib/requestAuth';
import { istDateString, showStartsAt } from '@/lib/istDate';
import { z } from 'zod';

const MAX_SHOWS_PER_REQUEST = 120;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must look like 2026-11-05')
  .refine(d => !isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), 'Invalid date');
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/, 'Times must look like 18:30');
const ticketPrice = z.coerce.number().int('Prices must be whole rupees').min(1, 'Prices must be at least ₹1').max(5000, 'Prices above ₹5000 look like a typo');

const scheduleSchema = z.object({
  movie_id: z.string({ error: 'Missing required show fields (movie, screen, dates, times)' }).min(1).max(100),
  screen_id: z.string({ error: 'Missing required show fields (movie, screen, dates, times)' }).min(1).max(100),
  show_date: isoDate.optional(),
  show_time: clockTime.optional(),
  dates: z.array(isoDate).max(62, 'Schedule at most 62 days at once').optional(),
  times: z.array(clockTime).max(8, 'At most 8 showtimes per day').optional(),
  price_classic: ticketPrice.optional(),
  price_normal: ticketPrice.optional(),
  price_premium: ticketPrice.optional(),
});

async function isAdmin(req: NextRequest): Promise<boolean> {
  try {
    const user = await getRequestUser(req);
    return user?.role === 'admin';
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    // Shows from a week ago onward: keeps the list (and occupancy query) bounded
    const fromDate = istDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const shows = await db.getShows(fromDate);
    const occupancy = await db.getShowOccupancy(shows.map(show => show.id));

    const enrichedShows = shows.map((show) => {
      const counts = occupancy[show.id] || { booked: 0, total: 0 };
      return {
        ...show,
        bookedSeats: counts.booked,
        totalSeats: counts.total,
        occupancyRate: counts.total > 0 ? Math.round((counts.booked / counts.total) * 100) : 0
      };
    });

    const response = NextResponse.json({ shows: enrichedShows });
    response.headers.set('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=30');
    return response;
  } catch (err) {
    console.error('Fetch shows API error:', err);
    return NextResponse.json({ error: 'Could not load shows' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const parsed = scheduleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid show details' }, { status: 400 });
    }
    const { movie_id, screen_id, show_date, show_time, dates, times, price_classic, price_normal, price_premium } = parsed.data;

    const classicPrice = price_classic ?? price_normal ?? 150;
    const premiumPrice = price_premium ?? 200;

    // Bulk creation if dates array or times array provided
    const targetDates: string[] = dates?.length ? dates : (show_date ? [show_date] : []);
    const targetTimes: string[] = times?.length ? times : (show_time ? [show_time] : []);

    if (targetDates.length === 0 || targetTimes.length === 0) {
      return NextResponse.json({ error: 'Missing required show fields (movie, screen, dates, times)' }, { status: 400 });
    }
    // Each show writes one row per seat; keep a single request to a sane size
    if (targetDates.length * targetTimes.length > MAX_SHOWS_PER_REQUEST) {
      return NextResponse.json({ error: `At most ${MAX_SHOWS_PER_REQUEST} shows can be scheduled at once` }, { status: 400 });
    }
    const pastSlot = targetDates.flatMap(d => targetTimes.map(t => ({ d, t })))
      .find(({ d, t }) => showStartsAt(d, t).getTime() < Date.now());
    if (pastSlot) {
      return NextResponse.json({ error: `${pastSlot.d} ${pastSlot.t} is in the past` }, { status: 400 });
    }

    const createdShows = [];
    const errors = [];

    for (const date of targetDates) {
      for (const time of targetTimes) {
        const formattedTime = time.length === 5 ? `${time}:00` : time;
        try {
          const newShow = await db.createShow({
            movie_id,
            screen_id,
            show_date: date,
            show_time: formattedTime,
            price_classic: classicPrice,
            price_premium: premiumPrice,
            price_normal: classicPrice,
            price_recliner: classicPrice
          } as any);
          createdShows.push(newShow);
        } catch (err: any) {
          console.error(`Create show ${date} ${time} failed:`, err);
          errors.push({ date, time, error: 'Already scheduled or invalid' });
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: createdShows.length,
      shows: createdShows,
      skipped: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error('Create show error:', err);
    return NextResponse.json({ error: 'Failed to schedule showtimes' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Show ID is required' }, { status: 400 });
    }

    await db.deleteShow(id);
    return NextResponse.json({ success: true, message: 'Showtime cancelled successfully' });
  } catch (err) {
    console.error('Delete show error:', err);
    return NextResponse.json({ error: 'Cannot cancel this showtime (it may have bookings).' }, { status: 500 });
  }
}
