import React from 'react';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import CheckoutClient from '@/features/bookings/components/CheckoutClient';
import ShowSummaryHeader from '@/features/bookings/components/ShowSummaryHeader';
import StatusMessage from '@/features/shared/components/StatusMessage';
import { db } from '@/lib/db';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getHoldOwnerFromCookies, isMockAuthAllowed } from '@/lib/requestAuth';
import { categoryPrice, seatLabel } from '@/features/shared/utils/format';

export const metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage(props: { searchParams: Promise<any> | any }) {
  // Await searchParams in case of Next.js 15+
  const searchParams = await Promise.resolve(props.searchParams);

  const showId = searchParams.showId || '';
  const seatIdsStr = searchParams.seats || '';
  const seatLayoutIds: string[] = seatIdsStr ? Array.from(new Set<string>(seatIdsStr.split(','))).slice(0, 10) : [];

  // Fetch show and seats from DB natively
  const cookieStore = await cookies();
  const [show, seats, { owner }] = await Promise.all([
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

  // The checkout only proceeds while this browser still holds every seat
  const holds = owner ? await db.getSeatHolds(showId, owner) : [];
  const heldIds = new Set(holds.map(h => h.seat_layout_id));
  const holdExpiresAt = holds
    .filter(h => seatLayoutIds.includes(h.seat_layout_id))
    .map(h => h.lock_expires_at)
    .sort()[0] || null;

  if (seatLayoutIds.length === 0 || !seatLayoutIds.every(id => heldIds.has(id))) {
    return (
      <>
        <Header />
        <StatusMessage
          tone="urgent"
          title="Your seat hold has expired"
          body="Seats are held for a few minutes while you pay. Pick your seats again to continue."
          actions={[{ href: `/booking/${showId}`, label: 'Choose seats again', primary: true }]}
        />
        <Footer />
      </>
    );
  }

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
          holdExpiresAt={holdExpiresAt}
        />
      </main>
      <Footer />
    </>
  );
}
