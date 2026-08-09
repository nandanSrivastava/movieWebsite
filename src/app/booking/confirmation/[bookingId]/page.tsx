import React from 'react';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import BookingConfirmationClient from '@/features/bookings/components/BookingConfirmationClient';

interface PageProps {
  params: Promise<{ bookingId: string }>;
}

export default async function ConfirmationPage({ params }: PageProps) {
  const { bookingId } = await params;
  
  // Fetch initial booking details
  const initialBooking = await db.getBookingById(bookingId);
  if (!initialBooking) {
    notFound();
  }

  return (
    <>
      <Header />
      <main style={{ backgroundColor: 'var(--bg-primary)', color: '#FFFFFF', minHeight: 'calc(100vh - 180px)', padding: '40px 20px', position: 'relative' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'center' }}>
          <BookingConfirmationClient initialBooking={initialBooking} />
        </div>
      </main>
      <Footer />
    </>
  );
}
