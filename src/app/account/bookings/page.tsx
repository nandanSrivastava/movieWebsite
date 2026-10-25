import React from 'react';
import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import { getUserFromCookies } from '@/lib/requestAuth';
import { redirect } from 'next/navigation';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { formatINR, formatShowDate, formatShowTime, hasShowStarted, seatLabel } from '@/features/shared/utils/format';
import styles from './page.module.css';

export const metadata = {
  title: 'My tickets',
  robots: { index: false, follow: false },
};

// Plain-language status for each payment state
const STATUS: Record<string, { label: string; tone: 'ok' | 'wait' | 'off' }> = {
  paid: { label: 'Confirmed', tone: 'ok' },
  pending: { label: 'Confirming payment', tone: 'wait' },
  refund_pending: { label: 'Refund on its way', tone: 'wait' },
  refunded: { label: 'Refunded', tone: 'off' },
  failed: { label: 'Not completed', tone: 'off' },
};

export default async function MyBookingsPage() {
  const user = await getUserFromCookies((await cookies()).getAll());
  const userId = user?.id ?? null;

  if (!userId) {
    redirect('/login?redirect=/account/bookings');
  }

  const bookings = await db.getBookingsByUser(userId);

  // Upcoming: shows that haven't started yet. Everything else is history.
  const now = Date.now();
  const isUpcoming = (b: typeof bookings[number]) =>
    !!b.show && !hasShowStarted(b.show.show_date, b.show.show_time, now);
  const upcoming = bookings.filter(isUpcoming)
    .sort((a, b) => `${a.show!.show_date}${a.show!.show_time}`.localeCompare(`${b.show!.show_date}${b.show!.show_time}`));
  const past = bookings.filter(b => !isUpcoming(b));

  const renderBooking = (booking: typeof bookings[number], isPast: boolean) => {
    const status = STATUS[booking.payment_status] ?? { label: booking.payment_status, tone: 'off' as const };
    const seats = booking.booking_seats?.map(bs => seatLabel(bs.seat_layout?.row_label, bs.seat_layout?.seat_number)).join(', ');
    return (
      <li key={booking.id} className={`${styles.booking} ${isPast ? styles.past : ''}`}>
        <div className={styles.info}>
          <h3 className={styles.title}>{booking.show?.movie?.title || 'Movie'}</h3>
          <p className={styles.when}>
            {booking.show ? `${formatShowDate(booking.show.show_date, { withYear: isPast })}, ${formatShowTime(booking.show.show_time)}` : 'Show details unavailable'}
          </p>
          <p className={styles.meta}>
            {seats && <span>Seats {seats}</span>}
            <span>{formatINR(booking.total_amount)}</span>
            {booking.checked_in_at && <span>Used at the gate</span>}
          </p>
        </div>
        <div className={styles.side}>
          <span className={`${styles.status} ${styles[status.tone]}`}>{status.label}</span>
          {booking.payment_status === 'paid' && booking.qr_code_token ? (
            <Link href={`/booking/confirmation/${booking.id}`} className={`btn ${isPast ? 'btn-ghost' : 'btn-primary'} btn-sm`}>
              View ticket
            </Link>
          ) : booking.payment_status === 'pending' ? (
            <Link href={`/booking/confirmation/${booking.id}`} className="btn btn-ghost btn-sm">
              Check status
            </Link>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 32, maxWidth: 880 }}>
        <h1 className="display" style={{ fontSize: 'clamp(2.25rem, 7vw, 3rem)', marginBottom: 20 }}>My tickets</h1>

        {bookings.length === 0 ? (
          <div className={styles.empty}>
            <Ticket aria-hidden />
            <div>
              <p className={styles.emptyTitle}>No tickets yet</p>
              <p>Tickets you book while signed in show up here.</p>
              <div className={styles.emptyActions}>
                <Link href="/movies" className="btn btn-primary btn-sm">Browse movies</Link>
                <Link href="/booking/lookup" className="btn btn-ghost btn-sm">Booked as a guest?</Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section aria-labelledby="upcoming-heading">
              <h2 id="upcoming-heading" className={styles.heading}>Upcoming</h2>
              {upcoming.length > 0
                ? <ul className={styles.list}>{upcoming.map(b => renderBooking(b, false))}</ul>
                : <p className={styles.none}>Nothing coming up. <Link href="/movies">Find a film</Link></p>}
            </section>
            {past.length > 0 && (
              <section aria-labelledby="past-heading" style={{ marginTop: 32 }}>
                <h2 id="past-heading" className={styles.heading}>Past</h2>
                <ul className={styles.list}>{past.map(b => renderBooking(b, true))}</ul>
              </section>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
