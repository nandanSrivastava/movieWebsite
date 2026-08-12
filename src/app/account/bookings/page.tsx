import React from 'react';
import { db } from '@/lib/db';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import Link from 'next/link';

export default async function MyBookingsPage() {
  const cookieStore = await cookies();
  let userId: string | null = null;
  const isSupabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (isSupabaseConfigured) {
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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) userId = user.id;
  } else {
    const mockSession = cookieStore.get('cinebook_mock_session');
    if (mockSession) {
      try {
        const sessionObj = JSON.parse(mockSession.value);
        userId = sessionObj.id;
      } catch {}
    }
  }

  if (!userId) {
    redirect('/login?redirect=/account/bookings');
  }

  const bookings = await db.getBookingsByUser(userId);

  return (
    <div className="bg-void min-h-screen">
      <Header />
      <main style={{ padding: '60px 20px', minHeight: '80vh', color: '#fff', maxWidth: '960px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '40px', fontFamily: 'var(--font-family-heading)' }}>
          My Bookings
        </h1>

        {bookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>No bookings found</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>You haven't booked any tickets yet.</p>
            <Link href="/" className="btn btn-primary" style={{ padding: '12px 24px' }}>Browse Movies</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {bookings.map(booking => (
              <div key={booking.id} style={{ 
                border: '1px solid var(--border-subtle)', 
                borderRadius: '12px', 
                padding: '24px',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '20px',
                backgroundColor: 'rgba(255,255,255,0.02)'
              }}>
                <div>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '8px' }}>
                    {booking.show?.movie?.title || 'Unknown Movie'}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '4px' }}>
                    <strong>Date:</strong> {booking.show?.show_date ? new Date(booking.show.show_date).toLocaleDateString() : 'N/A'} at {booking.show?.show_time || 'N/A'}
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '4px' }}>
                    <strong>Screen:</strong> {booking.show?.screen?.name || 'N/A'}
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    <strong>Status:</strong> <span style={{ color: booking.payment_status === 'paid' ? 'var(--accent-green)' : 'var(--accent-crimson)' }}>
                      {booking.payment_status.toUpperCase()}
                    </span>
                  </p>
                </div>
                <div>
                  {booking.payment_status === 'paid' && booking.qr_code_token ? (
                    <Link href={`/booking/confirmation/${booking.id}`} className="btn btn-secondary">
                      View Ticket
                    </Link>
                  ) : booking.payment_status === 'pending' ? (
                    <Link href={`/booking/confirmation/${booking.id}`} className="btn btn-primary">
                      Complete Payment
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
