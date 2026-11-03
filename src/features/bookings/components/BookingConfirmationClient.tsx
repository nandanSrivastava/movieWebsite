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
import { isCounterRefund, refundReasonText } from '@/features/shared/utils/refundReasons';
import styles from './BookingConfirmationClient.module.css';

interface BookingConfirmationClientProps {
  initialBooking: any;
  accessKey: string | null;
}

// While a payment is unconfirmed the page looks often at first, then settles down.
// It never stops on its own: this is the screen a customer stares at after paying.
const FAST_POLL_MS = 1_500;
const SLOW_POLL_MS = 15_000;
const FAST_POLL_FOR_MS = 30_000;
// Our own question to Razorpay, in case its webhook is late or lost
const FIRST_BANK_CHECK_MS = 5_000;
const BANK_CHECK_EVERY_MS = 30_000;
const MAX_BANK_CHECKS = 20;

const REFUND_TITLES: Record<string, string> = {
  show_cancelled: 'This show has been cancelled',
  show_cancelled_cash: 'This show has been cancelled',
  customer_changed_seats: 'This payment was refunded',
  refunded_by_cinema: 'This booking was refunded',
  amount_mismatch: 'This payment was refunded',
};

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

  const paymentId = searchParams.get('paymentId');
  const [openedAt] = useState(() => Date.now());
  const [bankHasBeenAsked, setBankHasBeenAsked] = useState(false);

  // ── 1. WEBHOOK COMPLETION POLLING WITH REACT QUERY ───────────
  const { data: booking, refetch } = useQuery({
    queryKey: ['bookingStatus', initialBooking.id],
    queryFn: async () => {
      const keyParam = accessKey ? `&k=${encodeURIComponent(accessKey)}` : '';
      const res = await fetch(`/api/bookings/status?bookingId=${initialBooking.id}${keyParam}`);
      if (!res.ok) throw new Error('Status check failed');
      return await res.json();
    },
    refetchInterval: (query) => {
      if (query.state?.data?.payment_status !== 'pending') return false;
      return Date.now() - openedAt < FAST_POLL_FOR_MS ? FAST_POLL_MS : SLOW_POLL_MS;
    },
    // A failed look isn't news: the customer still sees the last thing we knew
    retry: true,
    initialData: initialBooking,
  });

  const status = booking?.payment_status || 'pending';

  // The webhook normally settles this. If it's late or lost, ask Razorpay ourselves.
  const isPending = status === 'pending';
  useEffect(() => {
    if (!isPending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let checks = 0;
    const askBank = async () => {
      try {
        const res = await fetch('/api/bookings/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: initialBooking.id, ...(paymentId ? { paymentId } : {}) })
        });
        const data = res.ok ? await res.json() : null;
        if (stopped) return;
        if (data?.status === 'confirmed' || data?.status === 'refunded') {
          refetch();
          return;
        }
      } catch {
        // Offline: try again at the next turn
      }
      if (stopped) return;
      setBankHasBeenAsked(true);
      checks += 1;
      if (checks < MAX_BANK_CHECKS) timer = setTimeout(askBank, BANK_CHECK_EVERY_MS);
    };
    timer = setTimeout(askBank, FIRST_BANK_CHECK_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [isPending, paymentId, initialBooking.id, refetch]);

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
    if (bankHasBeenAsked) {
      // Razorpay handed us a payment id only if they finished paying there.
      // Without one, they may simply have closed the window, so don't claim they paid.
      const whereTheTicketGoes = booking?.customer_email
        ? <>It will also be emailed to <strong>{booking.customer_email}</strong>.</>
        : <>You can get it later from <Link href="/booking/lookup">Find my ticket</Link> on this phone, or show your number at the counter.</>;
      return (
        <div className={styles.state} role="status" aria-live="polite">
          <span className={`${styles.stateIcon} ${styles.urgent}`} aria-hidden><Clock /></span>
          <h1 className={styles.stateTitle}>{paymentId ? 'Still confirming your payment' : 'We haven’t seen a payment yet'}</h1>
          <p className={styles.stateBody}>
            {paymentId
              ? 'Your bank hasn’t confirmed this payment yet. If money was deducted, you’ll get your ticket or an automatic refund within a few minutes. This page keeps checking and updates by itself.'
              : 'If you paid, it can take a few minutes to reach us, and you’ll get your ticket or an automatic refund. This page keeps checking and updates by itself. If you didn’t finish paying, you haven’t been charged.'}
            {' '}{whereTheTicketGoes}
          </p>
          <div className={styles.stateActions}>
            <button onClick={() => refetch()} className="btn btn-primary">
              <RefreshCw aria-hidden />Check again
            </button>
            {paymentId
              ? <Link href="/booking/lookup" className="btn btn-ghost">Find my ticket later</Link>
              : <Link href={`/booking/${booking?.show_id}`} className="btn btn-ghost">Back to seats</Link>}
          </div>
        </div>
      );
    }

    return (
      <div className={styles.state} role="status" aria-live="polite">
        <span className={`spinner ${styles.bigSpinner}`} aria-hidden />
        <h1 className={styles.stateTitle}>Confirming your payment…</h1>
        <p className={styles.stateBody}>This usually takes a few seconds. Please keep this page open.</p>
      </div>
    );
  }

  // Money went back, or the booking never completed
  if (status === 'failed' || status === 'refunded' || status === 'refund_pending') {
    const refunding = status !== 'failed';
    const reason: string | null = booking?.refund_reason ?? null;
    const atCounter = isCounterRefund(reason);
    const moneyLine = atCounter ? ''
      : status === 'refunded' ? ' Your full payment has been refunded; banks usually show it within 5–7 working days.'
      : ' A full refund is being processed automatically.';
    const showGone = reason === 'show_cancelled' || reason === 'show_cancelled_cash';
    return (
      <div className={styles.state} role="alert">
        <span className={`${styles.stateIcon} ${styles.danger}`} aria-hidden><AlertCircle /></span>
        <h1 className={styles.stateTitle}>
          {!refunding ? 'Booking not completed' : (reason && REFUND_TITLES[reason]) || 'Seats no longer available'}
        </h1>
        <p className={styles.stateBody}>
          {refunding
            ? `${refundReasonText(reason)}${moneyLine}`
            : 'This booking wasn’t paid for in time, so no ticket was issued. If your bank shows a deduction, it returns the money automatically.'}
        </p>
        <div className={styles.stateActions}>
          {!showGone && <Link href={`/booking/${booking?.show_id}`} replace className="btn btn-primary">Choose seats again</Link>}
          <Link href={movieHref} className={`btn ${showGone ? 'btn-primary' : 'btn-ghost'}`}>Other showtimes</Link>
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
