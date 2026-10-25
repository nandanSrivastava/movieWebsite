import React, { forwardRef } from 'react';
import { formatINR } from '@/features/shared/utils/format';
import styles from './DigitalTicketStub.module.css';

interface DigitalTicketStubProps {
  booking: any;
  qrCodeUrl: string | null;
  seatLabels: string;
  formatTimeLabel: (timeStr: string) => string;
  formatDateLabel: (dateStr: string) => string;
}

// The on-screen ticket: printed paper against the dark hall, with a tear-off
// stub that carries the QR code staff scan at the entrance.
const DigitalTicketStub = forwardRef<HTMLDivElement, DigitalTicketStubProps>(({
  booking, qrCodeUrl, seatLabels, formatTimeLabel, formatDateLabel
}, ref) => {
  const movie = booking?.show?.movie;
  const seatCount = booking?.booking_seats?.length || seatLabels.split(',').filter(Boolean).length;
  const checkedIn = booking?.checked_in_at
    ? new Date(booking.checked_in_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : null;

  return (
    <article ref={ref} className={`printable-ticket ${styles.ticket}`} aria-label={`Ticket for ${movie?.title ?? 'your show'}`}>
      <header className={styles.brand}>
        <img src="/logo.jpeg" alt="" className={styles.logo} />
        <span className={styles.brandName}>Dhrub Cineplex</span>
        <span className={styles.brandPlace}>Bagaha</span>
      </header>

      <div className={styles.main}>
        <h2 className={styles.title}>{movie?.title}</h2>
        <p className={styles.meta}>
          {[movie?.certification, movie?.language, movie?.duration_minutes ? `${movie.duration_minutes} min` : null]
            .filter(Boolean).map(part => <span key={String(part)}>{part}</span>)}
        </p>

        <dl className={styles.facts}>
          <div>
            <dt>Date</dt>
            <dd>{booking?.show ? formatDateLabel(booking.show.show_date) : ''}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{booking?.show ? formatTimeLabel(booking.show.show_time) : ''}</dd>
          </div>
          <div className={styles.wide}>
            <dt>{seatCount === 1 ? 'Seat' : `Seats (${seatCount})`}</dt>
            <dd className={styles.seats}>{seatLabels}</dd>
          </div>
          <div>
            <dt>Hall</dt>
            <dd>Dhrub Talkies</dd>
          </div>
        </dl>
      </div>

      <div className={styles.perforation} aria-hidden />

      <div className={styles.stub}>
        <div className={styles.qrWrap}>
          {qrCodeUrl ? (
            <img src={qrCodeUrl} alt="Entry QR code" className={styles.qr} />
          ) : (
            <div className={`${styles.qr} ${styles.qrPending}`} role="status">Preparing QR…</div>
          )}
          {checkedIn && <span className={styles.used}>Used at the gate · {checkedIn}</span>}
        </div>
        <p className={styles.admit}>Admit {seatCount}</p>
        <p className={styles.instruction}>Show this QR code at the entrance</p>
        <p className={styles.bookingId}>Booking <span>{String(booking?.id ?? '').toUpperCase()}</span></p>

        <dl className={styles.receipt}>
          <div><dt>Name</dt><dd>{booking?.customer_name || 'Customer'}</dd></div>
          {booking?.customer_phone && <div><dt>Phone</dt><dd>{booking.customer_phone}</dd></div>}
          <div><dt>Paid</dt><dd>{formatINR(booking?.total_amount)}</dd></div>
          {booking?.razorpay_payment_id && <div><dt>Payment ref.</dt><dd className={styles.ref}>{booking.razorpay_payment_id}</dd></div>}
        </dl>
      </div>
    </article>
  );
});

DigitalTicketStub.displayName = 'DigitalTicketStub';

export default DigitalTicketStub;
