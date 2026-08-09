'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import { useToast } from '@/features/shared/context/ToastContext';

interface BookingConfirmationClientProps {
  initialBooking: any;
}

export default function BookingConfirmationClient({ initialBooking }: BookingConfirmationClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  
  const [booking, setBooking] = useState<any>(initialBooking);
  const [status, setStatus] = useState<string>(initialBooking.payment_status);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [pollingAttempts, setPollingAttempts] = useState(0);

  // ── 1. WEBHOOK COMPLETION POLLING ────────────────────────────
  useEffect(() => {
    if (status !== 'pending') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/bookings/status?bookingId=${booking.id}`);
        if (!res.ok) throw new Error('Status check failed');
        
        const data = await res.json();
        
        if (data.payment_status !== 'pending') {
          setStatus(data.payment_status);
          setBooking(data);
          clearInterval(interval);

          if (data.payment_status === 'paid') {
            showToast('Ticket confirmed successfully!', 'success');
          } else if (data.payment_status === 'failed' || data.payment_status === 'refunded') {
            showToast('Booking hold expired before payment finalized. Refund initiated.', 'error');
          }
        }
      } catch (err) {
        console.error('Polling status error:', err);
      }

      setPollingAttempts((prev) => {
        // Cap polling at 20 attempts (30 seconds) to prevent infinite loops
        if (prev >= 20) {
          clearInterval(interval);
          showToast('Payment confirmation is taking longer than expected. Please check your email or refresh.', 'info');
        }
        return prev + 1;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [status, booking.id, showToast]);

  // ── 2. QR CODE DATA URL GENERATOR ────────────────────────────
  useEffect(() => {
    if (status === 'paid' && booking.qr_code_token) {
      const loadQr = async () => {
        try {
          const res = await fetch(`/api/checkout/qr?token=${encodeURIComponent(booking.qr_code_token)}`);
          if (res.ok) {
            const data = await res.json();
            setQrCodeUrl(data.qrCode);
          }
        } catch (err) {
          console.error(err);
        }
      };
      loadQr();
    }
  }, [status, booking]);

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

  const seatLabels = booking.booking_seats?.map((bs: any) => `${bs.seat_layout?.row_label}-${bs.seat_layout?.seat_number}`).join(', ') || '';

  // ── 3. RENDER STATES ─────────────────────────────────────────

  // State: Pending Validation
  if (status === 'pending') {
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
          onClick={() => router.replace(`/booking/${booking.show_id}`)}
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
      <div style={{
        maxWidth: '420px',
        width: '100%',
        backgroundColor: 'var(--bg-card)',
        color: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid var(--border-gold)',
        boxShadow: 'var(--shadow-xl)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-family-body)',
        zIndex: 10
      }}>
        {/* Ticket Header (Movie Info) */}
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          color: '#FFFFFF',
          padding: '24px',
          textAlign: 'center',
          borderBottom: '2px dashed var(--border-gold)',
          position: 'relative'
        }}>
          {/* Half circles mock ticket punch (left & right) */}
          <div style={{ position: 'absolute', bottom: '-10px', left: '-10px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'var(--bg-primary)' }} />
          <div style={{ position: 'absolute', bottom: '-10px', right: '-10px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'var(--bg-primary)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '8px' }}>
            <img src="/logo.jpeg" alt="Dhrub Cineplex Logo" style={{ height: '32px', borderRadius: '4px', marginBottom: '6px' }} />
            <span style={{ fontSize: '0.9rem', color: 'var(--highlight-gold)', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
              Dhrub Cineplex
            </span>
            <span style={{ fontSize: '0.6rem', color: '#9CA3AF', letterSpacing: '2px', textTransform: 'uppercase', marginTop: '2px' }}>
              Experience the Epic Tale
            </span>
          </div>

          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '8px', fontFamily: 'var(--font-family-heading)', lineHeight: 1.2, color: '#FFFFFF' }}>
            {booking.show?.movie?.title}
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#9CA3AF', marginTop: '4px' }}>
            {booking.show?.movie?.genre} • {booking.show?.movie?.duration_minutes} Mins
          </p>
        </div>

        {/* Ticket Body (Show Coordinates) */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 600 }}>Date</span>
              <p style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: '#FFFFFF' }}>
                {booking.show ? formatDateLabel(booking.show.show_date) : ''}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 600 }}>Show Time</span>
              <p style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: '#FFFFFF' }}>
                {booking.show ? formatTimeLabel(booking.show.show_time) : ''}
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 600 }}>Screen</span>
              <p style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: '#FFFFFF' }}>
                {booking.show?.screen?.name}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 600 }}>Seats Selection</span>
              <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--highlight-gold)', marginTop: '2px' }}>
                {seatLabels}
              </p>
            </div>
          </div>

          <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)', width: '100%', margin: '10px 0' }} />

          {/* QR Code Container */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            {qrCodeUrl ? (
              <img 
                src={qrCodeUrl} 
                alt="Ticket QR Code" 
                style={{
                  width: '180px',
                  height: '180px',
                  border: '1px solid var(--border-gold)',
                  padding: '8px',
                  borderRadius: '8px',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)'
                }}
              />
            ) : (
              <div style={{ width: '180px', height: '180px', backgroundColor: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>Generating QR...</span>
              </div>
            )}
            <span style={{ fontSize: '0.7rem', color: '#9CA3AF', fontWeight: 500, letterSpacing: '0.5px' }}>
              Verification ID: {booking.id}
            </span>
          </div>

          <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)', width: '100%', margin: '10px 0' }} />

          {/* Customer Metadata details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: '#9CA3AF' }}>
            <p>👤 <strong style={{ color: '#FFFFFF' }}>Holder:</strong> {booking.customer_name || 'Customer'}</p>
            <p>📞 <strong style={{ color: '#FFFFFF' }}>Phone:</strong> {booking.customer_phone || ''}</p>
            <p>🧾 <strong style={{ color: '#FFFFFF' }}>Ref ID:</strong> {booking.razorpay_payment_id || 'Mock Payment'}</p>
            <p>💳 <strong style={{ color: '#FFFFFF' }}>Amount Paid:</strong> <span style={{ color: 'var(--highlight-gold)', fontWeight: 'bold' }}>₹{booking.total_amount}</span></p>
          </div>

          <div style={{
            marginTop: '12px',
            paddingTop: '16px',
            borderTop: '1px dashed rgba(212, 175, 55, 0.3)',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#9CA3AF',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <span style={{ color: 'var(--highlight-gold)', fontWeight: 700 }}>
              ★ Thank You For Choosing Dhrub Cineplex Bagaha ★
            </span>
            <span style={{ fontSize: '0.7rem' }}>
              📸 @dhrubcineplex | Follow us on Instagram for more details
            </span>
          </div>

        </div>
      </div>

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
