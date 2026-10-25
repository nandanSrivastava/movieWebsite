'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/features/shared/context/ToastContext';
import { useQuery } from '@tanstack/react-query';
import { Download, CalendarPlus, Navigation, CheckCircle2, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { toPng } from 'html-to-image';
import DigitalTicketStub from '@/features/bookings/components/DigitalTicketStub';
import GoldTicketPassExport from '@/features/bookings/components/GoldTicketPassExport';
import StepIndicator from '@/features/bookings/components/StepIndicator';
import { formatShowDate, formatShowTime, seatLabel, showStartsAt } from '@/features/shared/utils/format';
import styles from './BookingConfirmationClient.module.css';

interface BookingConfirmationClientProps {
  initialBooking: any;
  accessKey: string | null;
}

// Same coordinates as the map on the home page
const CINEMA_LOCATION = '27.1401051,84.0555802';
const CINEMA_ADDRESS = 'Dhrub Cineplex, Sukhban, Bagaha, Bihar 845105';

function calendarLink(booking: any, seats: string) {
  const show = booking?.show;
  if (!show) return null;
  const start = showStartsAt(show.show_date, show.show_time);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + (Number(show.movie?.duration_minutes) || 180) * 60_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${show.movie?.title ?? 'Movie'} at Dhrub Cineplex`,
    dates: `${stamp(start)}/${stamp(end)}`,
    location: CINEMA_ADDRESS,
    details: `Seats: ${seats}\nBooking: ${String(booking.id).toUpperCase()}\nShow the QR code on your ticket at the entrance.`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function BookingConfirmationClient({ initialBooking, accessKey }: BookingConfirmationClientProps) {
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const ticketRef = useRef<HTMLDivElement>(null);
  const exportPassRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadImage = async () => {
    const targetEl = exportPassRef.current || ticketRef.current;
    if (!targetEl) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toPng(targetEl, {
        cacheBust: true,
        quality: 0.95,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `ticket-${booking?.id || 'dhrub-cineplex'}.png`;
      link.href = dataUrl;
      link.click();
      showToast('Ticket saved as an image.', 'success');
    } catch (err) {
      console.error('Failed to download ticket image', err);
      showToast('Couldn’t save the ticket image. Take a screenshot of the ticket instead.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const [pollingAttempts, setPollingAttempts] = useState(0);
  const [hasNotified, setHasNotified] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [checkingBank, setCheckingBank] = useState(false);

  // ── 1. WEBHOOK COMPLETION POLLING WITH REACT QUERY ───────────
  const { data: booking, refetch } = useQuery({
    queryKey: ['bookingStatus', initialBooking.id],
    queryFn: async () => {
      setPollingAttempts(p => p + 1);
      const keyParam = accessKey ? `&k=${encodeURIComponent(accessKey)}` : '';
      const res = await fetch(`/api/bookings/status?bookingId=${initialBooking.id}${keyParam}`);
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

  // The page itself says what happened; no extra pop-ups for the outcome
  useEffect(() => {
    if (status !== 'pending' && !hasNotified) {
      setHasNotified(true);
    }

    const paymentId = searchParams.get('paymentId');
    const maxAttempts = paymentId ? 3 : 20;

    if (pollingAttempts >= maxAttempts && status === 'pending' && !hasNotified) {
      setHasNotified(true);
      if (paymentId) {
        setCheckingBank(true);
        fetch('/api/bookings/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: initialBooking.id, paymentId })
        }).then(res => res.json()).then(data => {
          if (data.status === 'confirmed' || data.status === 'refunded') {
             refetch();
          } else {
             setVerificationFailed(true);
          }
        }).catch(() => {
          setVerificationFailed(true);
        }).finally(() => setCheckingBank(false));
      } else {
        setVerificationFailed(true);
      }
    }
  }, [status, pollingAttempts, hasNotified, searchParams, initialBooking.id, refetch]);

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

  // On-screen ticket uses the shared formats; the PNG pass keeps its own uppercase styling
  const formatTimeLabel = (timeStr: string) => formatShowTime(timeStr);
  const formatDateLabel = (dateStr: string) => formatShowDate(dateStr, { withYear: true });

  const seatLabels = booking?.booking_seats?.map((bs: any) => seatLabel(bs.seat_layout?.row_label, bs.seat_layout?.seat_number)).join(', ') || '';
  const movieHref = booking?.show?.movie_id ? `/movies/${booking.show.movie_id}` : '/movies';

  // ── 3. RENDER STATES ─────────────────────────────────────────

  if (status === 'pending') {
    if (verificationFailed) {
      return (
        <div className={styles.state}>
          <span className={`${styles.stateIcon} ${styles.urgent}`} aria-hidden><Clock /></span>
          <h1 className={styles.stateTitle}>Still confirming your payment</h1>
          <p className={styles.stateBody}>
            The bank hasn&apos;t confirmed this payment yet. If money was deducted, we&apos;ll confirm your ticket
            (and email it to you) or refund you automatically within a few minutes. You can safely close this page.
          </p>
          <div className={styles.stateActions}>
            <button onClick={() => window.location.reload()} className="btn btn-primary">
              <RefreshCw aria-hidden />Check again
            </button>
            <Link href="/booking/lookup" className="btn btn-ghost">Find my ticket later</Link>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.state} role="status" aria-live="polite">
        <span className={`spinner ${styles.bigSpinner}`} aria-hidden />
        <h1 className={styles.stateTitle}>{checkingBank ? 'Checking with your bank…' : 'Confirming your payment…'}</h1>
        <p className={styles.stateBody}>This usually takes a few seconds. Please keep this page open.</p>
      </div>
    );
  }

  // Seats lost before payment completed, or checkout abandoned
  if (status === 'failed' || status === 'refunded' || status === 'refund_pending') {
    const refunding = status !== 'failed';
    return (
      <div className={styles.state} role="alert">
        <span className={`${styles.stateIcon} ${styles.danger}`} aria-hidden><AlertCircle /></span>
        <h1 className={styles.stateTitle}>
          {refunding ? 'Seats no longer available' : 'Booking not completed'}
        </h1>
        <p className={styles.stateBody}>
          {refunding
            ? (status === 'refunded'
                ? 'The seat hold ran out and the seats went to another customer before your payment arrived. Your full payment has been refunded; banks usually show it within 5–7 working days.'
                : 'The seat hold ran out and the seats went to another customer before your payment arrived. A full refund is being processed automatically.')
            : 'The seat hold expired before payment, so no ticket was issued and nothing was charged for this booking.'}
        </p>
        <div className={styles.stateActions}>
          <Link href={`/booking/${booking?.show_id}`} replace className="btn btn-primary">Choose seats again</Link>
          <Link href={movieHref} className="btn btn-ghost">Other showtimes</Link>
        </div>
      </div>
    );
  }

  // Paid: the ticket
  const calendarHref = calendarLink(booking, seatLabels);

  return (
    <div className={styles.paid}>
      <div className={`non-printable ${styles.steps}`}>
        <StepIndicator current="Ticket" />
      </div>

      <div className={`non-printable ${styles.banner}`}>
        <span className={styles.bannerIcon} aria-hidden><CheckCircle2 /></span>
        <div>
          <h1 className={styles.bannerTitle}>You&apos;re booked</h1>
          <p className={styles.bannerBody}>
            Show the QR code at the entrance.
            {booking?.customer_email && <> A copy is on its way to <strong>{booking.customer_email}</strong>.</>}
          </p>
        </div>
      </div>

      <DigitalTicketStub
        ref={ticketRef}
        booking={booking}
        qrCodeUrl={qrCodeUrl}
        seatLabels={seatLabels}
        formatTimeLabel={formatTimeLabel}
        formatDateLabel={formatDateLabel}
      />

      {/* OFF-SCREEN GOLD LUXURY PASS (USED FOR HIGH-RES PNG DOWNLOAD & MAILING) */}
      <div aria-hidden style={{ position: 'absolute', left: '-9999px', top: 0, opacity: 0, pointerEvents: 'none' }}>
        <GoldTicketPassExport
          ref={exportPassRef}
          booking={booking}
          qrCodeUrl={qrCodeUrl}
          seatLabels={seatLabels}
          formatTimeLabel={(t) => formatShowTime(t)}
          formatDateLabel={(d) => formatShowDate(d)}
        />
      </div>

      <div className={`non-printable ${styles.actions}`}>
        <button
          type="button"
          onClick={handleDownloadImage}
          disabled={isDownloading || !qrCodeUrl}
          aria-busy={isDownloading || undefined}
          className="btn btn-primary btn-lg"
        >
          {isDownloading ? <span className="spinner" aria-hidden /> : <Download aria-hidden />}
          {isDownloading ? 'Saving…' : 'Save ticket image'}
        </button>
        <div className={styles.secondary}>
          {calendarHref && (
            <a href={calendarHref} target="_blank" rel="noreferrer" className="btn btn-ghost">
              <CalendarPlus aria-hidden />Add to calendar
            </a>
          )}
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${CINEMA_LOCATION}`} target="_blank" rel="noreferrer" className="btn btn-ghost">
            <Navigation aria-hidden />Directions
          </a>
        </div>
      </div>

      <p className={`non-printable ${styles.help}`}>
        Lost this page? Use <Link href="/booking/lookup">Find my ticket</Link> with your phone number, or show the number at the counter.
      </p>

      <Link href="/movies" className={`non-printable btn btn-quiet ${styles.more}`}>Browse more movies</Link>
    </div>
  );
}
