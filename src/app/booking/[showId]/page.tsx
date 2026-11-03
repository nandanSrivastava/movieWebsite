import React, { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import StatusMessage from '@/features/shared/components/StatusMessage';
import SeatingMapClient from '@/features/bookings/components/SeatingMapClient';
import ShowSummaryHeader from '@/features/bookings/components/ShowSummaryHeader';
import { hasShowStarted } from '@/features/shared/utils/format';

// Same page for everyone, rebuilt at most every 5 seconds per show: during a
// rush thousands of visitors share one render. Seat status is refreshed by the
// client right after load, and each visitor's own holds come from /api/seats/holds.
export const revalidate = 5;

export function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ showId: string }>;
}

// Metadata and the page ask for the same show; one database read serves both
const getShow = cache((showId: string) => db.getShowById(showId));

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const show = await getShow((await params).showId);
  return {
    title: show?.movie?.title ? `Choose seats: ${show.movie.title}` : 'Choose seats',
    // A seat map is only useful for a few days; the film's page is what should rank
    robots: { index: false, follow: true },
  };
}

export default async function BookingPage({ params }: PageProps) {
  const { showId } = await params;

  const show = await getShow(showId);
  if (!show) {
    notFound();
  }

  if (show.cancelled_at || show.movie?.is_active === false) {
    return (
      <>
        <Header />
        <StatusMessage
          tone="danger"
          title={show.cancelled_at ? 'This show has been cancelled' : 'This film is no longer showing'}
          body={show.cancelled_at
            ? "It can't be booked. Online payments are refunded automatically, and cash tickets are repaid at the counter."
            : "It can't be booked online any more. Tickets already bought are still valid."}
          actions={[{ href: '/movies', label: 'See what’s showing', primary: true }]}
        />
        <Footer />
      </>
    );
  }

  // Seat layout + status. Who holds or bought each seat stays on the server.
  const seats = await db.getSeatsForShow(showId);
  const initialSeats = seats.map(seat => ({
    id: seat.id,
    show_id: seat.show_id,
    seat_layout_id: seat.seat_layout_id,
    status: seat.status,
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    booking_id: null,
    seat_layout: seat.seat_layout,
  }));

  return (
    <>
      <Header />
      <main className="container" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <ShowSummaryHeader
          show={show}
          step="Seats"
          backHref={`/movies/${show.movie_id}`}
          backLabel="Showtimes"
        />
        <SeatingMapClient
          show={show}
          initialSeats={initialSeats}
          showStarted={hasShowStarted(show.show_date, show.show_time)}
        />
      </main>
      <Footer />
    </>
  );
}
