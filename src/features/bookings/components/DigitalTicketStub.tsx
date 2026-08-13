import React from 'react';

interface DigitalTicketStubProps {
  booking: any;
  qrCodeUrl: string | null;
  seatLabels: string;
  formatTimeLabel: (timeStr: string) => string;
  formatDateLabel: (dateStr: string) => string;
}

export default function DigitalTicketStub({
  booking, qrCodeUrl, seatLabels, formatTimeLabel, formatDateLabel
}: DigitalTicketStubProps) {
  return (
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
          {booking?.show?.movie?.title}
        </h3>
        <p style={{ fontSize: '0.85rem', color: '#9CA3AF', marginTop: '4px' }}>
          {booking?.show?.movie?.genre} • {booking?.show?.movie?.duration_minutes} Mins
        </p>
      </div>

      {/* Ticket Body (Show Coordinates) */}
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 600 }}>Date</span>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: '#FFFFFF' }}>
              {booking?.show ? formatDateLabel(booking.show.show_date) : ''}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 600 }}>Show Time</span>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: '#FFFFFF' }}>
              {booking?.show ? formatTimeLabel(booking.show.show_time) : ''}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 600 }}>Screen</span>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px', color: '#FFFFFF' }}>
              Dhrub Talkies
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
            Verification ID: {booking?.id}
          </span>
        </div>

        <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)', width: '100%', margin: '10px 0' }} />

        {/* Customer Metadata details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: '#9CA3AF' }}>
          <p>👤 <strong style={{ color: '#FFFFFF' }}>Holder:</strong> {booking?.customer_name || 'Customer'}</p>
          <p>📞 <strong style={{ color: '#FFFFFF' }}>Phone:</strong> {booking?.customer_phone || ''}</p>
          <p>🧾 <strong style={{ color: '#FFFFFF' }}>Ref ID:</strong> {booking?.razorpay_payment_id || 'Mock Payment'}</p>
          <p>💳 <strong style={{ color: '#FFFFFF' }}>Amount Paid:</strong> <span style={{ color: 'var(--highlight-gold)', fontWeight: 'bold' }}>₹{booking?.total_amount}</span></p>
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
  );
}
