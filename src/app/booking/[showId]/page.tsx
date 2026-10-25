import React from 'react';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
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

export default async function BookingPage({ params }: PageProps) {
  const { showId } = await params;

  const show = await db.getShowById(showId);
  if (!show) {
    notFound();
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
