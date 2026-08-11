import React from 'react';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import CheckoutClient from '@/features/bookings/components/CheckoutClient';
import { db } from '@/lib/db';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export default async function CheckoutPage(props: { searchParams: Promise<any> | any }) {
  // Await searchParams in case of Next.js 15+
  const searchParams = await Promise.resolve(props.searchParams);
  
  const showId = searchParams.showId || '';
  const seatIdsStr = searchParams.seats || '';
  const seatLayoutIds = seatIdsStr ? seatIdsStr.split(',') : [];

  // Fetch show and seats from DB natively
  const [show, seats] = await Promise.all([
    db.getShowById(showId),
    db.getSeatsForShow(showId)
  ]);

  if (!show) {
    return (
      <>
        <Header />
        <div style={{ backgroundColor: 'var(--bg-void)', color: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-family-heading)', fontWeight: 700 }}>Show not found or invalid checkout session.</h3>
        </div>
        <Footer />
      </>
    );
  }

  // Calculate pricing summary securely on the server
  let totalAmount = 0;
  const selectedSeatLabels: string[] = [];

  seatLayoutIds.forEach((layoutId: string) => {
    const seat = seats.find((s: any) => s.seat_layout_id === layoutId);
    if (seat && seat.seat_layout) {
      selectedSeatLabels.push(`${seat.seat_layout.row_label}-${seat.seat_layout.seat_number}`);
      const category = seat.seat_layout.category;
      const price = {
        normal: show.price_normal,
        premium: show.price_premium,
        recliner: show.price_recliner
      }[category as 'normal' | 'premium' | 'recliner'] || 0;
      totalAmount += Number(price);
    }
  });

  // Resolve user server-side for initial form values
  let user = null;
  const isSupabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (isSupabaseConfigured) {
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { get: (name) => cookieStore.get(name)?.value } }
      );
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const profile = await db.getProfile(data.user.id);
        if (profile) {
          user = { ...data.user, full_name: profile.full_name, phone: profile.phone };
        }
      }
    } catch {}
  } else {
    // Check mock cookie
    const cookieStore = await cookies();
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
      <main style={{ 
        backgroundColor: 'var(--bg-void)', 
        color: '#FFFFFF', 
        minHeight: 'calc(100vh - 180px)', 
        padding: '50px 20px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow Effects */}
        <div style={{
          position: 'absolute',
          top: '15%',
          left: '10%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(150, 40, 40, 0.04) 0%, transparent 70%)',
          filter: 'blur(100px)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        <div className="container" style={{ maxWidth: '960px', position: 'relative', zIndex: 1 }}>
          <CheckoutClient 
            showId={showId}
            seatLayoutIds={seatLayoutIds}
            show={show}
            selectedSeatLabels={selectedSeatLabels}
            totalAmount={totalAmount}
            user={user}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
