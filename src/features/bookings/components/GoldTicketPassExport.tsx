import React, { forwardRef } from 'react';

interface GoldTicketPassExportProps {
  booking: any;
  qrCodeUrl: string | null;
  seatLabels: string;
  formatTimeLabel: (timeStr: string) => string;
  formatDateLabel: (dateStr: string) => string;
}

/* 3D Gold Shooting Star Emblem (Matching Reference Image) */
const ShootingStar3D = ({ size = 68 }: { size?: number }) => (
  <svg width={size} height={size * 0.9} viewBox="0 0 160 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="goldLightExport" x1="0" y1="0" x2="160" y2="140" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFF4BC" />
        <stop offset="40%" stopColor="#F5D77F" />
        <stop offset="75%" stopColor="#C89736" />
        <stop offset="100%" stopColor="#7E5612" />
      </linearGradient>
      <linearGradient id="goldDarkExport" x1="0" y1="0" x2="160" y2="140" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#D9AD4B" />
        <stop offset="50%" stopColor="#9B6F1C" />
        <stop offset="100%" stopColor="#4A3105" />
      </linearGradient>
      <filter id="dropShadowExport" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="3" dy="5" stdDeviation="4" floodColor="#000000" floodOpacity="0.8" />
      </filter>
    </defs>
    <g filter="url(#dropShadowExport)">
      {/* 3D Shooting Tails */}
      <path d="M8 122 L65 72 L55 62 Z" fill="url(#goldDarkExport)" />
      <path d="M12 120 L68 70 L60 62 Z" fill="url(#goldLightExport)" opacity="0.9" />

      <path d="M22 135 L80 62 L70 52 Z" fill="url(#goldDarkExport)" />
      <path d="M28 132 L82 60 L75 52 Z" fill="url(#goldLightExport)" />

      <path d="M42 138 L92 68 L84 60 Z" fill="url(#goldDarkExport)" opacity="0.8" />
      <path d="M46 136 L94 66 L88 60 Z" fill="url(#goldLightExport)" opacity="0.9" />

      {/* Main 3D Star Facets */}
      <path d="M108 8 L122 42 L156 45 L130 68 L138 102 L108 83 L78 102 L86 68 L60 45 L94 42 Z" fill="url(#goldLightExport)" />
      <path d="M108 8 L108 83 L78 102 L86 68 L60 45 L94 42 Z" fill="url(#goldDarkExport)" opacity="0.4" />
      <path d="M108 30 L114 46 L130 47 L117 59 L121 76 L108 66 L95 76 L99 59 L86 47 L102 46 Z" fill="#09101C" />
    </g>
  </svg>
);

/* Icons */
const ClapperIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F5D77F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" stroke="#F5D77F" fill="rgba(245, 215, 127, 0.08)" />
    <path d="M3 11L7 3H10L6 11H3Z" fill="#F5D77F" />
    <path d="M8 11L12 3H15L11 11H8Z" fill="#F5D77F" />
    <path d="M13 11L17 3H20L16 11H13Z" fill="#F5D77F" />
    <line x1="12" y1="14" x2="12" y2="18" />
    <line x1="10" y1="16" x2="14" y2="16" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F5D77F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="17" rx="3" fill="rgba(245, 215, 127, 0.08)" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <rect x="6" y="12" width="3" height="2" rx="0.5" fill="#F5D77F" />
    <rect x="10.5" y="12" width="3" height="2" rx="0.5" fill="#F5D77F" />
    <rect x="15" y="12" width="3" height="2" rx="0.5" fill="#F5D77F" />
    <rect x="6" y="16" width="3" height="2" rx="0.5" fill="#F5D77F" />
    <rect x="10.5" y="16" width="3" height="2" rx="0.5" fill="#F5D77F" />
  </svg>
);

const ClockIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F5D77F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" fill="rgba(245, 215, 127, 0.08)" />
    <polyline points="12 7 12 12 15 14" stroke="#F5D77F" strokeWidth="2" />
  </svg>
);

const InstagramIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5D77F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const GoldTicketPassExport = forwardRef<HTMLDivElement, GoldTicketPassExportProps>(({
  booking, qrCodeUrl, seatLabels, formatTimeLabel, formatDateLabel
}, ref) => {
  const movieTitle = booking?.show?.movie?.title ? booking.show.movie.title.toUpperCase() : 'BAHUBALI';
  const showDate = booking?.show ? formatDateLabel(booking.show.show_date).toUpperCase() : 'SUN, AUG 16';
  const showTime = booking?.show ? formatTimeLabel(booking.show.show_time).toUpperCase() : '01:30 PM';
  const seats = seatLabels || 'D-4, C-6';
  const totalAmount = booking?.total_amount || 150;

  return (
    <div 
      ref={ref}
      style={{
        width: '820px',
        height: '430px',
        background: 'radial-gradient(ellipse at 40% 30%, #0E1624 0%, #080C14 70%, #04060B 100%)',
        color: '#F5D77F',
        borderRadius: '24px',
        border: '2.5px solid #E2C275',
        boxShadow: '0 30px 80px rgba(0,0,0,0.95), 0 0 45px rgba(226,194,117,0.22)',
        display: 'flex',
        flexDirection: 'row',
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
        fontFamily: "'Cinzel', 'Playfair Display', system-ui, -apple-system, sans-serif"
      }}
    >
      {/* Outer Concave Ticket Cutout Notches */}
      <div style={{ position: 'absolute', top: '-14px', left: '-14px', width: '28px', height: '28px', borderRadius: '50%', background: '#030712', border: '2.5px solid #E2C275', zIndex: 10 }} />
      <div style={{ position: 'absolute', bottom: '-14px', left: '-14px', width: '28px', height: '28px', borderRadius: '50%', background: '#030712', border: '2.5px solid #E2C275', zIndex: 10 }} />
      <div style={{ position: 'absolute', top: '-14px', right: '-14px', width: '28px', height: '28px', borderRadius: '50%', background: '#030712', border: '2.5px solid #E2C275', zIndex: 10 }} />
      <div style={{ position: 'absolute', bottom: '-14px', right: '-14px', width: '28px', height: '28px', borderRadius: '50%', background: '#030712', border: '2.5px solid #E2C275', zIndex: 10 }} />

      {/* Inner Golden Inset Border Line */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        right: '10px',
        bottom: '10px',
        border: '1px solid rgba(226, 194, 117, 0.4)',
        borderRadius: '16px',
        pointerEvents: 'none',
        zIndex: 1
      }} />

      {/* ── LEFT MAIN TICKET BODY ───────────────────────── */}
      <div style={{
        flex: '1 1 570px',
        padding: '24px 32px 20px 32px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        zIndex: 2
      }}>

        {/* BRAND HEADER */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '2px' }}>
            <ShootingStar3D size={68} />
            <div style={{ textAlign: 'left' }}>
              <h1 style={{
                fontSize: '2.4rem',
                fontWeight: 900,
                letterSpacing: '3px',
                margin: 0,
                textTransform: 'uppercase',
                lineHeight: 0.95,
                color: '#F5D77F',
                textShadow: '0 3px 6px rgba(0,0,0,0.8)'
              }}>
                DHRUB
              </h1>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                letterSpacing: '7px',
                margin: 0,
                marginTop: '4px',
                color: '#E2C275',
                textTransform: 'uppercase'
              }}>
                CINEPLEX
              </h2>
            </div>
          </div>

          <p style={{
            fontSize: '0.62rem',
            color: '#F5D77F',
            letterSpacing: '4px',
            textTransform: 'uppercase',
            margin: '6px 0 6px 0',
            fontWeight: 700
          }}>
            EXPERIENCE THE EPIC TALE
          </p>

          {/* Star Line Divider */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', width: '90%', margin: '0 auto' }}>
            <div style={{ height: '1px', flex: 1, background: 'linear-gradient(90deg, transparent, #E2C275 60%, transparent)' }} />
            <span style={{ fontSize: '0.7rem', color: '#F5D77F' }}>★</span>
            <div style={{ height: '1px', flex: 1, background: 'linear-gradient(90deg, transparent, #E2C275 60%, transparent)' }} />
          </div>
        </div>

        {/* MIDDLE ROW: MOVIE | DATE | TIME */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.3fr 1.2fr 1fr',
          gap: '12px',
          alignItems: 'center',
          margin: '8px 0',
          textAlign: 'center',
          padding: '4px 0'
        }}>

          {/* Movie Premiere */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
            <ClapperIcon />
            <div>
              <span style={{ fontSize: '0.58rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700, display: 'block' }}>
                MOVIE
              </span>
              <span style={{ fontSize: '0.92rem', color: '#FFFFFF', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {movieTitle}
              </span>
            </div>
          </div>

          {/* Vertical Line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ height: '32px', width: '1px', backgroundColor: 'rgba(226, 194, 117, 0.3)' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <CalendarIcon />
                <span style={{ fontSize: '0.58rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700 }}>
                  DATE
                </span>
              </div>
              <div style={{
                background: 'linear-gradient(135deg, #FBE097 0%, #E3BA5E 50%, #BD8C28 100%)',
                color: '#080C14',
                fontWeight: 900,
                fontSize: '0.78rem',
                padding: '5px 14px',
                borderRadius: '16px',
                textAlign: 'center',
                minWidth: '100px'
              }}>
                {showDate}
              </div>
            </div>
          </div>

          {/* Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
            <div style={{ height: '32px', width: '1px', backgroundColor: 'rgba(226, 194, 117, 0.3)' }} />
            <ClockIcon />
            <div style={{ textAlign: 'left' }}>
              <span style={{ fontSize: '0.58rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700, display: 'block' }}>
                TIME
              </span>
              <span style={{ fontSize: '1.05rem', color: '#FFFFFF', fontWeight: 900, textTransform: 'uppercase' }}>
                {showTime}
              </span>
            </div>
          </div>

        </div>

        {/* SEAT NO. | SILVER | PRICE CAPSULE BOX */}
        <div style={{
          border: '1.8px solid #E2C275',
          borderRadius: '14px',
          padding: '8px 20px',
          backgroundColor: 'rgba(226, 194, 117, 0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '4px 0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#F5D77F', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
              SEAT NO.
            </span>
            <div style={{
              background: 'linear-gradient(135deg, #FBE097 0%, #E3BA5E 50%, #BD8C28 100%)',
              color: '#080C14',
              fontWeight: 900,
              fontSize: '0.88rem',
              padding: '4px 16px',
              borderRadius: '12px'
            }}>
              {seats}
            </div>
          </div>

          <div style={{ height: '22px', width: '1px', backgroundColor: 'rgba(226, 194, 117, 0.4)' }} />

          <span style={{ fontSize: '0.98rem', fontWeight: 900, color: '#FFFFFF', letterSpacing: '2px', textTransform: 'uppercase' }}>
            SILVER
          </span>

          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#F5D77F' }}>
            Rs {totalAmount}/-
          </span>
        </div>

        {/* FOOTER MESSAGING & INSTAGRAM HANDLE */}
        <div style={{ textAlign: 'center', marginTop: '6px' }}>
          <p style={{
            fontSize: '0.62rem',
            fontWeight: 800,
            color: '#F5D77F',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            margin: '0 0 6px 0'
          }}>
            ★ THANKYOU FOR CHOOSING DHRUB CINEPLEX BAGAHA ★
          </p>

          <div style={{
            border: '1.2px solid rgba(226, 194, 117, 0.6)',
            borderRadius: '24px',
            padding: '5px 16px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            backgroundColor: 'rgba(4, 6, 11, 0.6)'
          }}>
            <InstagramIcon />
            <span style={{ fontSize: '0.72rem', color: '#FFFFFF', fontWeight: 700 }}>
              @dhrubcineplex
            </span>
            <span style={{ fontSize: '0.7rem', color: '#E2C275' }}>│</span>
            <span style={{ fontSize: '0.68rem', color: '#9CA3AF', fontWeight: 600 }}>
              Follow us on Instagram for more details
            </span>
          </div>
        </div>

      </div>

      {/* ── VERTICAL PERFORATED TEAR LINE ─────────────────── */}
      <div style={{
        position: 'relative',
        width: '2px',
        borderLeft: '2.5px dashed #E2C275',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 3
      }}>
        {/* Tear Notches (Top & Bottom Center) */}
        <div style={{
          position: 'absolute',
          top: '-14px',
          left: '-14px',
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          backgroundColor: '#030712',
          border: '2.5px solid #E2C275'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-14px',
          left: '-14px',
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          backgroundColor: '#030712',
          border: '2.5px solid #E2C275'
        }} />
      </div>

      {/* ── RIGHT TEAR-OFF VERIFICATION STUB ─────────────── */}
      <div style={{
        width: '240px',
        padding: '24px 18px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        textAlign: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        position: 'relative',
        zIndex: 2
      }}>

        {/* Top Emblem */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <ShootingStar3D size={56} />
          <h3 style={{
            fontSize: '1.15rem',
            fontWeight: 900,
            letterSpacing: '2px',
            margin: '2px 0 0 0',
            color: '#F5D77F',
            textTransform: 'uppercase'
          }}>
            DHRUB
          </h3>
          <span style={{ fontSize: '0.62rem', color: '#F5D77F', letterSpacing: '3px', fontWeight: 800, textTransform: 'uppercase' }}>
            CINEPLEX
          </span>
        </div>

        <p style={{
          fontSize: '0.68rem',
          color: '#F5D77F',
          fontWeight: 800,
          letterSpacing: '2px',
          margin: '4px 0',
          textTransform: 'uppercase'
        }}>
          ★ SCAN QR ★
        </p>

        {/* QR Code White Card */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          padding: '8px',
          border: '2px solid #E2C275',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '148px'
        }}>
          {qrCodeUrl ? (
            <img 
              src={qrCodeUrl} 
              alt="Ticket QR Code" 
              style={{ width: '132px', height: '132px', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ width: '132px', height: '132px', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.7rem', color: '#6B7280' }}>QR Code</span>
            </div>
          )}
          <span style={{ fontSize: '0.65rem', color: '#E50914', fontWeight: 900, marginTop: '4px', letterSpacing: '0.5px' }}>
            @DHRUBCINEPLEX
          </span>
        </div>

        {/* Footer Text */}
        <div style={{ marginTop: '4px' }}>
          <p style={{ fontSize: '0.55rem', color: '#9CA3AF', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0, fontWeight: 700 }}>
            EXPERIENCE THE EPIC TALE
          </p>
          <span style={{ fontSize: '0.75rem', color: '#F5D77F' }}>★</span>
        </div>

      </div>

    </div>
  );
});

GoldTicketPassExport.displayName = 'GoldTicketPassExport';

export default GoldTicketPassExport;
