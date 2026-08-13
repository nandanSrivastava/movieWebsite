'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import { useToast } from '@/features/shared/context/ToastContext';
import { useQuery } from '@tanstack/react-query';
import DigitalTicketStub from '@/features/bookings/components/DigitalTicketStub';

interface BookingConfirmationClientProps {
  initialBooking: any;
}

export default function BookingConfirmationClient({ initialBooking }: BookingConfirmationClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const [hasNotified, setHasNotified] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);

  // ── 1. WEBHOOK COMPLETION POLLING WITH REACT QUERY ───────────
  const { data: booking, refetch } = useQuery({
    queryKey: ['bookingStatus', initialBooking.id],
    queryFn: async () => {
      setPollingAttempts(p => p + 1);
      const res = await fetch(`/api/bookings/status?bookingId=${initialBooking.id}`);
      if (!res.ok) throw new Error('Status check failed');
      return await res.json();
    },
    refetchInterval: (query) => {
      // In React Query v5, query is passed to refetchInterval.
      const paymentId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('paymentId') : null;
      const maxAttempts = paymentId ? 3 : 20;
      
      if (query.state?.data?.payment_status !== 'pending' || pollingAttempts >= maxAttempts) return false;
      return 1500;
    },
    initialData: initialBooking,
  });

  const status = booking?.payment_status || 'pending';

  useEffect(() => {
    if (status !== 'pending' && !hasNotified) {
      setHasNotified(true);
      if (status === 'paid') {
        showToast('Ticket confirmed successfully!', 'success');
      } else if (status === 'failed' || status === 'refunded') {
        showToast('Booking hold expired before payment finalized. Refund initiated.', 'error');
      }
    }
    
    const paymentId = searchParams.get('paymentId');
    const maxAttempts = paymentId ? 3 : 20;

    if (pollingAttempts >= maxAttempts && status === 'pending' && !hasNotified) {
      setHasNotified(true);
      if (paymentId) {
        showToast('Verifying payment with the bank...', 'info');
        fetch('/api/bookings/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: initialBooking.id, paymentId })
        }).then(res => res.json()).then(data => {
          if (data.status === 'confirmed' || data.status === 'refunded') {
             refetch();
          } else {
             showToast('Payment verification failed. Please contact support.', 'error');
             setVerificationFailed(true);
          }
        }).catch(() => {
          showToast('Payment verification failed. Please contact support.', 'error');
          setVerificationFailed(true);
        });
      } else {
        showToast('Payment confirmation is taking longer than expected. Please check your email or refresh.', 'info');
        setVerificationFailed(true);
      }
    }
  }, [status, pollingAttempts, hasNotified, showToast, searchParams, initialBooking.id, refetch]);

  // ── 2. QR CODE GENERATOR WITH REACT QUERY ────────────────────
  const { data: qrCodeData } = useQuery({
    queryKey: ['qrCode', booking?.qr_code_token],
    queryFn: async () => {
      const res = await fetch(`/api/checkout/qr?token=${encodeURIComponent(booking.qr_code_token)}`);
      if (!res.ok) throw new Error('Failed to generate QR');
      return await res.json();
    },
    enabled: status === 'paid' && !!booking?.qr_code_token,
  });

  const qrCodeUrl = qrCodeData?.qrCode || null;

  // Helpers
  const formatTimeLabel = (timeStr: string) => {
    try {
      const [hours, minutes] = timeStr.split(':');
      const h = parseInt(hours);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 || 12;
      return `${displayH.toString().padStart(2, '0')}:${minutes} ${ampm}`;
    } catch {
      return timeStr;
    }
  };

  const formatDateLabel = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      return date.toLocaleDateString('en-US', options);
    } catch {
      return dateStr;
    }
  };

  const seatLabels = booking?.booking_seats?.map((bs: any) => `${bs.seat_layout?.row_label}-${bs.seat_layout?.seat_number}`).join(', ') || '';

  // ── 3. RENDER STATES ─────────────────────────────────────────

  // State: Pending Validation
  if (status === 'pending') {
    if (verificationFailed) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#FFFFFF', textAlign: 'center', padding: '24px'
        }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'rgba(229, 9, 20, 0.1)', color: '#E50914', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 'bold', marginBottom: '24px' }}>
            !
          </div>
          <h3 style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-family-heading)' }}>Verification Failed</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '480px', lineHeight: 1.6, marginTop: '8px', marginBottom: '32px' }}>
            We could not automatically verify your transaction status with the bank. If money was deducted, it will be refunded or the ticket will be issued manually. Please contact support.
          </p>
          <button onClick={() => window.location.reload()} className="btn btn-primary" style={{ padding: '12px 28px' }}>
            Try Again
          </button>
        </div>
      );
    }

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        color: '#FFFFFF',
        fontFamily: 'var(--font-family-body)'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          border: '3px solid var(--border-subtle)',
          borderTopColor: 'var(--crimson)',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px'
        }} />
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Verifying Transaction...</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '8px' }}>
          We are confirming your seat allocations with the bank. Do not close this window.
        </p>

        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // State: Hold Expired / Failed Checkout
  if (status === 'failed' || status === 'refunded') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        padding: '24px',
        color: '#FFFFFF'
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: 'rgba(229, 9, 20, 0.1)',
          color: '#E50914',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          fontWeight: 'bold',
          marginBottom: '24px'
        }}>
          ✕
        </div>
        <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-family-heading)' }}>
          Seat Reservation Expired
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '480px', lineHeight: 1.6, marginTop: '8px', marginBottom: '32px' }}>
          The 6-minute seat hold expired before the checkout completed. The seats were released for other bookings.
          Any money deducted has been automatically refunded.
        </p>
        <button 
          onClick={() => router.replace(`/booking/${booking?.show_id}`)}
          className="btn btn-primary"
          style={{ padding: '12px 28px' }}
        >
          Select Different Seats
        </button>
      </div>
    );
  }

  // State: Payment Success & Ticket Render
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', padding: '20px 0' }}>
      
      {/* Visual Ambient Glow */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '450px',
        height: '450px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%)',
        filter: 'blur(50px)',
        pointerEvents: 'none'
      }} />

      {/* SUCCESS BANNER */}
      <div style={{ textAlign: 'center', marginBottom: '32px', zIndex: 5 }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          color: '#10B981',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '22px',
          fontWeight: 'bold',
          marginBottom: '16px'
        }}>
          ✓
        </div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-family-heading)' }}>
          Booking Confirmed!
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>
          Your digital ticket stub has been generated. Enjoy your movie!
        </p>
      </div>

      {/* PHYSICAL TICKET STUB DESIGN */}
      <DigitalTicketStub 
        booking={booking} 
        qrCodeUrl={qrCodeUrl} 
        seatLabels={seatLabels}
        formatTimeLabel={formatTimeLabel}
        formatDateLabel={formatDateLabel}
      />

      <div style={{ marginTop: '32px', zIndex: 5 }}>
        <button 
          onClick={() => router.push('/')}
          className="btn btn-secondary"
          style={{ color: '#FFFFFF', borderColor: 'var(--border-default)' }}
        >
          Return to Home Catalog
        </button>
      </div>

    </div>
  );
}
