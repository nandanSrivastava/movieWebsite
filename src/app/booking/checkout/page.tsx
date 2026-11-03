import React from 'react';
import { redirect } from 'next/navigation';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import CheckoutClient from '@/features/bookings/components/CheckoutClient';
import ShowSummaryHeader from '@/features/bookings/components/ShowSummaryHeader';
import StatusMessage from '@/features/shared/components/StatusMessage';
import { db } from '@/lib/db';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getHoldOwnerFromCookies, isMockAuthAllowed } from '@/lib/requestAuth';
import { checkEarlierAttempt } from '@/lib/payments';
import { toMobileDigits } from '@/lib/contactRules';
import { categoryPrice, hasShowStarted, seatLabel } from '@/features/shared/utils/format';
import type { Booking } from '@/lib/types';

export const metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

const ticketPath = (booking: Booking) =>
  `/booking/confirmation/${booking.id}${booking.access_key ? `?k=${encodeURIComponent(booking.access_key)}` : ''}`;

export default async function CheckoutPage(props: { searchParams: Promise<any> | any }) {
  // Await searchParams in case of Next.js 15+
  const searchParams = await Promise.resolve(props.searchParams);

  const showId = typeof searchParams.showId === 'string' ? searchParams.showId : '';
  const seatIdsStr = typeof searchParams.seats === 'string' ? searchParams.seats : '';
  const seatLayoutIds: string[] = seatIdsStr ? Array.from(new Set<string>(seatIdsStr.split(','))).slice(0, 10) : [];

  // Fetch show and seats from DB natively
  const cookieStore = await cookies();
  const [show, seats, { owner, owners }] = await Promise.all([
    db.getShowById(showId),
    db.getSeatsForShow(showId),
    getHoldOwnerFromCookies(cookieStore.getAll()),
  ]);

  if (!show) {
    return (
      <>
        <Header />
        <StatusMessage
          tone="danger"
          title="We couldn't find this checkout"
          body="The link may be incomplete. Pick your show and seats again to continue."
          actions={[{ href: '/movies', label: 'Browse movies', primary: true }]}
        />
        <Footer />
      </>
    );
  }

  const [holds, earlier] = await Promise.all([
    owner ? db.getSeatHolds(showId, owner) : [],
    db.findHolderBooking(showId, seatLayoutIds, owners),
  ]);

  // The checkout only proceeds while this browser still holds every seat
  const heldIds = new Set(holds.map(h => h.seat_layout_id));
  const holdsEverySeat = seatLayoutIds.length > 0 && seatLayoutIds.every(id => heldIds.has(id));

  // This customer may have paid already (closed the tab, phone dropped the page
  // while they were in their UPI app). They go to their ticket, not to a Pay button.
  // An old refund is different: holding these seats again means they're buying again.
  const earlierAttempt = earlier && (earlier.payment_status === 'pending' || earlier.payment_status === 'paid' || !holdsEverySeat)
    ? earlier
    : null;
  const attempt = earlierAttempt ? await checkEarlierAttempt(earlierAttempt) : 'none';
  if (earlierAttempt && attempt === 'ticket') redirect(ticketPath(earlierAttempt));

  if (show.cancelled_at || show.movie?.is_active === false) {
    return (
      <>
        <Header />
        <StatusMessage
          tone="danger"
          title="This show isn't available any more"
          body={show.cancelled_at
            ? "It has been cancelled, so it can't be booked. If you paid online, your money comes back automatically."
            : "It has been taken off sale, so it can't be booked. Tickets already bought are still valid."}
          actions={[{ href: '/movies', label: 'Browse movies', primary: true }]}
        />
        <Footer />
      </>
    );
  }

  if (hasShowStarted(show.show_date, show.show_time)) {
    return (
      <>
        <Header />
        <StatusMessage
          tone="urgent"
          title="Booking has closed for this show"
          body="This show has started. Pick another showtime to book."
          actions={[{ href: `/movies/${show.movie_id}`, label: 'See other showtimes', primary: true }]}
        />
        <Footer />
      </>
    );
  }

  if (!holdsEverySeat) {
    // The hold is gone but they did start paying, so the honest answer is "we're still checking"
    const paymentInDoubt = earlierAttempt && attempt === 'pending';
    return (
      <>
        <Header />
        <StatusMessage
          tone="urgent"
          title="Your seat hold has expired"
          body={paymentInDoubt
            ? 'Seats are held for a few minutes while you pay. If you paid and money left your account, we’ll confirm your ticket or refund you automatically within a few minutes.'
            : 'Seats are held for a few minutes while you pay. Pick your seats again to continue.'}
          actions={[
            { href: `/booking/${showId}`, label: 'Choose seats again', primary: true },
            paymentInDoubt
              ? { href: ticketPath(earlierAttempt), label: 'Check my payment' }
              : { href: '/booking/lookup', label: 'Already paid? Find my ticket' },
          ]}
        />
        <Footer />
      </>
    );
  }

  const firstExpiry = holds
    .filter(h => seatLayoutIds.includes(h.seat_layout_id))
    .map(h => h.lock_expires_at)
    .sort()[0];
  const holdSecondsLeft = firstExpiry ? Math.max(0, Math.floor((new Date(firstExpiry).getTime() - Date.now()) / 1000)) : 0;

  // Pricing summary for display (the server prices the booking itself)
  let totalAmount = 0;
  const selectedSeatLabels: string[] = [];
  const counts: Record<'classic' | 'premium', number> = { classic: 0, premium: 0 };

  seatLayoutIds.forEach((layoutId: string) => {
    const seat = seats.find((s: any) => s.seat_layout_id === layoutId);
    if (seat && seat.seat_layout) {
      selectedSeatLabels.push(seatLabel(seat.seat_layout.row_label, seat.seat_layout.seat_number));
      const category = seat.seat_layout.category === 'premium' ? 'premium' : 'classic';
      counts[category] += 1;
      totalAmount += categoryPrice(show, category);
    }
  });

  const lineItems = (['classic', 'premium'] as const)
    .filter(c => counts[c] > 0)
    .map(c => ({ label: c === 'premium' ? 'Premium' : 'Classic', count: counts[c], price: categoryPrice(show, c) }));

  // Resolve user server-side for initial form values
  let user = null;
  const isSupabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (isSupabaseConfigured) {
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  cookieStore.set(name, value, options)
                );
              } catch {}
            },
          },
        }
      );
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const profile = await db.getProfile(data.user.id);
        if (profile) {
          user = { ...data.user, full_name: profile.full_name, phone: profile.phone, role: profile.role };
        }
      }
    } catch {}
  } else if (isMockAuthAllowed()) {
    // Local development only: mock login cookie
    const mockSession = cookieStore.get('cinebook_mock_session');
    if (mockSession) {
      try {
        const sessionObj = JSON.parse(mockSession.value);
        user = sessionObj;
      } catch {}
    }
  }

  // Coming back to an unfinished attempt: what they typed, and which payment to keep checking
  const unfinished = earlierAttempt?.payment_status === 'pending' ? earlierAttempt : null;

  return (
    <>
      <Header />
      <main className="container" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <ShowSummaryHeader show={show} step="Pay" backHref={`/booking/${showId}`} backLabel="Seats" />
        <CheckoutClient
          showId={showId}
          seatLayoutIds={seatLayoutIds}
          show={show}
          selectedSeatLabels={selectedSeatLabels}
          lineItems={lineItems}
          totalAmount={totalAmount}
          user={user}
          holdSecondsLeft={holdSecondsLeft}
          earlierDetails={unfinished && {
            name: unfinished.customer_name ?? '',
            phone: toMobileDigits(unfinished.customer_phone),
            email: unfinished.customer_email ?? '',
          }}
          resume={unfinished && attempt === 'pending' ? { bookingId: unfinished.id, accessKey: unfinished.access_key } : null}
        />
      </main>
      <Footer />
    </>
  );
}
