import { NextRequest, NextResponse, after } from 'next/server';
import { db } from '@/lib/db';
import { getRequestUser } from '@/lib/requestAuth';
import { istDateString, showStartsAt } from '@/lib/istDate';
import { processRefund } from '@/lib/payments';
import { deliverRefundEmail } from '@/lib/mailer';
import { revalidateShowPages } from '@/lib/revalidate';
import { findOverlap } from '@/features/admin/utils/showOverlap';
import { formatShowTime } from '@/features/shared/utils/format';
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

// A film can run into the next calendar day, so look one day either side
const dayBefore = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
const dayAfter = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

// Enough to finish a batch of refunds when a sold show is cancelled; the reconcile job takes any left over
const REFUNDS_PER_CANCEL_BATCH = 50;

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
    const slotPassed = (date: string, time: string) => showStartsAt(date, time).getTime() < Date.now();
    if (targetDates.every(d => targetTimes.every(t => slotPassed(d, t)))) {
      return NextResponse.json({ error: `${targetDates[0]} ${targetTimes[0]} is in the past` }, { status: 400 });
    }

    const movie = await db.getMovieById(movie_id);
    if (!movie) {
      return NextResponse.json({ error: 'That movie no longer exists. Refresh the page and pick it again.' }, { status: 400 });
    }
    if (movie.is_active === false) {
      return NextResponse.json({ error: `${movie.title} is hidden from the site. Show it again before scheduling.` }, { status: 400 });
    }

    const sortedDates = [...targetDates].sort();
    const onScreen = (await db.getShowsForScreen(screen_id, dayBefore(sortedDates[0]), dayAfter(sortedDates[sortedDates.length - 1])))
      .map(show => ({
        show_date: show.show_date,
        show_time: show.show_time,
        durationMinutes: Number(show.movie?.duration_minutes) || 0,
        title: show.movie?.title,
      }));

    const createdShows = [];
    const errors = [];

    for (const date of targetDates) {
      for (const time of targetTimes) {
        // Scheduling from today on: today's earlier slots simply don't apply
        if (slotPassed(date, time)) {
          errors.push({ date, time, error: 'Already in the past' });
          continue;
        }
        const formattedTime = time.length === 5 ? `${time}:00` : time;
        const slot = { show_date: date, show_time: formattedTime, durationMinutes: Number(movie.duration_minutes) || 0, title: movie.title };
        const clash = findOverlap(slot, onScreen);
        if (clash) {
          errors.push({ date, time, error: `Clashes with ${clash.title ?? 'another show'} at ${formatShowTime(clash.show_time)} on ${clash.show_date}` });
          continue;
        }
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
          onScreen.push(slot);
        } catch (err: any) {
          console.error(`Create show ${date} ${time} failed:`, err);
          errors.push({ date, time, error: err?.code === '23505' ? 'Already scheduled' : 'Could not be saved' });
        }
      }
    }

    if (createdShows.length === 0) {
      return NextResponse.json({ error: errors[0]?.error || 'Nothing was scheduled', skipped: errors }, { status: 409 });
    }

    revalidateShowPages(movie_id);
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

/**
 * Cancels a show. Nobody booked it: it's removed. Otherwise it comes off sale,
 * online tickets are refunded and their buyers told, and cash tickets are marked
 * for repayment at the counter.
 */
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

    const show = await db.getShowById(id);
    const result = await db.cancelShow(id);
    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'That showtime no longer exists.' }, { status: 404 });
    }
    if (result.status === 'already_started') {
      return NextResponse.json({ error: 'This show has already started, so it can’t be cancelled. To refund one customer, use the Razorpay dashboard.' }, { status: 409 });
    }

    const user = await getRequestUser(req);
    await db.logAudit(user?.id ?? null, 'SHOW_CANCELLED', { showId: id, ...result });
    revalidateShowPages(show?.movie_id, id);

    if (result.onlineRefunds > 0 || result.cashRefunds > 0) {
      after(async () => {
        for (const booking of await db.getRefundPendingBookings(REFUNDS_PER_CANCEL_BATCH)) {
          await processRefund(booking.id);
        }
        for (const booking of await db.getUnsentRefundEmailBookings(REFUNDS_PER_CANCEL_BATCH)) {
          await deliverRefundEmail(booking.id);
        }
      });
    }

    return NextResponse.json({
      success: true,
      removed: result.status === 'deleted',
      onlineRefunds: result.onlineRefunds,
      cashRefunds: result.cashRefunds,
      message: 'Showtime cancelled successfully',
    });
  } catch (err) {
    console.error('Delete show error:', err);
    return NextResponse.json({ error: 'Could not cancel this showtime. Please try again.' }, { status: 500 });
  }
}
