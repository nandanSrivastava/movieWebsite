import React from 'react';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import StatusMessage from '@/features/shared/components/StatusMessage';
import BookingConfirmationClient from '@/features/bookings/components/BookingConfirmationClient';
import { getUserFromCookies } from '@/lib/requestAuth';
import { canViewBooking, ticketView } from '@/lib/bookingAccess';

interface PageProps {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ k?: string }>;
}

export const metadata = {
  title: 'Your Ticket',
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({ params, searchParams }: PageProps) {
  const { bookingId } = await params;
  const { k: accessKey } = await searchParams;

  const booking = await db.getBookingById(bookingId);
  const user = booking ? await getUserFromCookies((await cookies()).getAll()) : null;

  // Same response for "no such booking" and "not yours", so ids can't be probed
  if (!booking || !canViewBooking(booking, accessKey, user)) {
    return (
      <>
        <Header />
        <StatusMessage
          tone="info"
          title="Open your ticket from your email"
          body="This ticket link is incomplete or has expired. Use the link in your confirmation email, sign in to the account you booked with, or have your tickets emailed to you again."
          actions={[
            { href: '/booking/lookup', label: 'Find my tickets', primary: true },
            { href: '/account/bookings', label: 'My bookings' },
          ]}
        />
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 32 }}>
        <BookingConfirmationClient initialBooking={ticketView(booking)} accessKey={accessKey || null} />
      </main>
      <Footer />
    </>
  );
}
