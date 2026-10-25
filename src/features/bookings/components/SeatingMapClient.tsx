'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TriangleAlert, RefreshCw, Clock } from 'lucide-react';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { useToast } from '@/features/shared/context/ToastContext';
import { ShowType, SeatStatusType } from '@/lib/db';
import { isMockMode } from '@/lib/config';
import { supabase as supabaseClient } from '@/lib/supabaseClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { categoryPrice, formatINR, formatShowTime, hasShowStarted, seatLabel } from '@/features/shared/utils/format';
import SeatingGrid from '@/features/bookings/components/SeatingGrid';
import SeatingLegend from '@/features/bookings/components/SeatingLegend';
import BookingBar from '@/features/bookings/components/BookingBar';
import styles from './SeatingMapClient.module.css';

interface SeatingMapClientProps {
  show: ShowType;
  initialSeats: SeatStatusType[];
  showStarted?: boolean;
}

// Seat map refresh: every ~10s with jitter so open tabs don't poll in lockstep.
// The endpoint is CDN-cached for a few seconds, so this stays cheap at scale.
const POLL_BASE_MS = 10_000;
const POLL_JITTER_MS = 3_000;
const MAX_SEATS = 10;

export default function SeatingMapClient({ show, initialSeats, showStarted = false }: SeatingMapClientProps) {
  const router = useRouter();
  const { user } = useCineBookAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [selectedSeats, setSelectedSeats] = useState<Set<string>>(() => new Set());
  const [heldByMe, setHeldByMe] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [pollInterval] = useState(() => POLL_BASE_MS + Math.floor(Math.random() * POLL_JITTER_MS));
  const [started, setStarted] = useState(showStarted);

  const { data: statusById, isError: refreshFailed } = useQuery({
    queryKey: ['seats', show.id],
    queryFn: async () => {
      const res = await fetch(`/api/seats/status?showId=${show.id}`);
      if (!res.ok) throw new Error('Failed fetching seats');
      const data = await res.json();
      return Object.fromEntries((data.seats as { seat_layout_id: string; status: SeatStatusType['status'] }[])
        .map(seat => [seat.seat_layout_id, seat.status]));
    },
    // The page HTML is cached for a few seconds, so refresh statuses right away
    initialData: () => Object.fromEntries(initialSeats.map(seat => [seat.seat_layout_id, seat.status])),
    initialDataUpdatedAt: 0,
    refetchInterval: pollInterval,
    staleTime: 0,
    retry: 1,
  });

  // The page can sit open past showtime; close booking when the show begins
  useEffect(() => {
    if (started) return;
    const check = () => { if (hasShowStarted(show.show_date, show.show_time)) setStarted(true); };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [started, show.show_date, show.show_time]);

  // Seats this browser already holds (e.g. came back from checkout) start selected
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/seats/holds?showId=${show.id}`)
      .then(res => (res.ok ? res.json() : { seatLayoutIds: [] }))
      .then(({ seatLayoutIds }: { seatLayoutIds: string[] }) => {
        if (cancelled || seatLayoutIds.length === 0) return;
        setHeldByMe(new Set(seatLayoutIds));
        setSelectedSeats(prev => new Set([...Array.from(prev), ...seatLayoutIds]));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [show.id]);

  const seats = useMemo(
    () => initialSeats.map(seat => ({ ...seat, status: statusById?.[seat.seat_layout_id] ?? seat.status })),
    [initialSeats, statusById]
  );

  // If someone else takes a seat this user picked (but hasn't held yet), drop it
  useEffect(() => {
    const lost = Array.from(selectedSeats).filter((id) => {
      const status = statusById?.[id];
      return status === 'booked' || (status === 'locked' && !heldByMe.has(id));
    });
    if (lost.length > 0) {
      setSelectedSeats(prev => new Set(Array.from(prev).filter(id => !lost.includes(id))));
      showToast('A seat you picked was just taken by another customer.', 'info');
    }
  }, [statusById, selectedSeats, heldByMe, showToast]);

  // ── SEAT SELECTION ───────────────────────────────────────────
  const handleSeatClick = (seat: SeatStatusType) => {
    if (started) return;
    if (seat.status === 'booked') return;

    if (seat.status === 'locked' && !heldByMe.has(seat.seat_layout_id)) {
      showToast('This seat is temporarily held by another customer.', 'info');
      return;
    }

    const layoutId = seat.seat_layout_id;
    const newSelected = new Set(selectedSeats);

    if (newSelected.has(layoutId)) {
      newSelected.delete(layoutId);
    } else {
      if (newSelected.size >= MAX_SEATS) {
        showToast(`You can select a maximum of ${MAX_SEATS} seats per booking.`, 'info');
        return;
      }
      newSelected.add(layoutId);
    }

    setSelectedSeats(newSelected);
  };

  // ── HOLD SEATS AND GO TO CHECKOUT ────────────────────────────
  const handleProceedToPayment = async () => {
    if (selectedSeats.size === 0) {
      showToast('Please select at least one seat.', 'info');
      return;
    }

    setSubmitting(true);
    try {
      let token = '';
      if (!isMockMode && user) {
        const { data } = await supabaseClient.auth.getSession();
        token = data.session?.access_token || '';
      }

      // Guests are identified by an httpOnly cookie the server sets on this call
      const lockRes = await fetch('/api/seats/lock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ showId: show.id, seatLayoutIds: Array.from(selectedSeats) })
      });

      if (!lockRes.ok) {
        const errData = await lockRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to hold the selected seats.');
      }

      setHeldByMe(new Set(selectedSeats));
      router.push(`/booking/checkout?showId=${show.id}&seats=${Array.from(selectedSeats).join(',')}`);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to hold seats. Please try another seat.', 'error');
      queryClient.invalidateQueries({ queryKey: ['seats', show.id] });
      setSubmitting(false);
    }
  };

  // ── GRID DATA ────────────────────────────────────────────────
  const rowsMap: Record<string, SeatStatusType[]> = {};
  seats.forEach((seat) => {
    const label = seat.seat_layout?.row_label || 'A';
    if (!rowsMap[label]) rowsMap[label] = [];
    rowsMap[label].push(seat);
  });

  const sortedRows = Object.keys(rowsMap).sort();
  sortedRows.forEach((row) => {
    rowsMap[row].sort((a, b) => (a.seat_layout?.seat_number || 0) - (b.seat_layout?.seat_number || 0));
  });

  // Selection summary: labels, count per category, display total
  const classicPrice = categoryPrice(show, 'classic');
  const premiumPrice = categoryPrice(show, 'premium');
  let totalAmount = 0;
  const selectedSeatLabels: string[] = [];
  const counts = { classic: 0, premium: 0 };
  seats.forEach((seat) => {
    if (!selectedSeats.has(seat.seat_layout_id) || !seat.seat_layout) return;
    selectedSeatLabels.push(seatLabel(seat.seat_layout.row_label, seat.seat_layout.seat_number));
    const category = seat.seat_layout.category === 'premium' ? 'premium' : 'classic';
    counts[category] += 1;
    totalAmount += categoryPrice(show, category);
  });
  const breakdown = [
    counts.classic ? `${counts.classic} × Classic ${formatINR(classicPrice)}` : null,
    counts.premium ? `${counts.premium} × Premium ${formatINR(premiumPrice)}` : null,
  ].filter(Boolean).join('  ·  ');

  const hasPremium = seats.some(s => s.seat_layout?.category === 'premium');
  const openSeats = seats.filter(s => s.status === 'available' || heldByMe.has(s.seat_layout_id)).length;
  const fullHouse = !started && seats.length > 0 && openSeats === 0;
  const count = selectedSeats.size;
  const otherTimes = `/movies/${show.movie_id}`;

  return (
    <div className={styles.layout}>
      {started && (
        <div className="notice notice-urgent" role="status">
          <Clock aria-hidden />
          <div>
            <strong>Booking has closed for this show.</strong> It started at {formatShowTime(show.show_time)}.{' '}
            <Link href={otherTimes} className={styles.inlineLink}>See other showtimes</Link>
          </div>
        </div>
      )}
      {fullHouse && (
        <div className="notice notice-accent" role="status">
          <TriangleAlert aria-hidden />
          <div>
            <strong>This show is full.</strong> Seats on hold may open up again in a few minutes.{' '}
            <Link href={otherTimes} className={styles.inlineLink}>Try another showtime</Link>
          </div>
        </div>
      )}
      {refreshFailed && (
        <div className="notice" role="status">
          <RefreshCw aria-hidden />
          <div>Can&apos;t check the latest seat availability right now. We&apos;ll keep trying; seats are confirmed when you continue.</div>
        </div>
      )}

      <SeatingGrid
        sortedRows={sortedRows}
        rowsMap={rowsMap}
        show={show}
        selectedSeats={selectedSeats}
        handleSeatClick={handleSeatClick}
        heldByMe={heldByMe}
        disabled={started}
      />

      <SeatingLegend classicPrice={classicPrice} premiumPrice={premiumPrice} hasPremium={hasPremium} />

      <BookingBar
        label="Your seats"
        summary={count === 0 ? (
          <>
            <p className={styles.barTitle}>{started ? 'Booking closed' : `Pick up to ${MAX_SEATS} seats`}</p>
            <p className={styles.barMeta}>{started ? 'This show has started' : 'We hold your seats while you pay'}</p>
          </>
        ) : (
          <>
            <p className={styles.barTitle}>
              {selectedSeatLabels.join(', ')}
              {count >= MAX_SEATS && <span className={styles.cap}> · limit reached</span>}
            </p>
            <p className={styles.barMeta}>{breakdown}</p>
          </>
        )}
        total={count > 0 ? (
          <div aria-live="polite">
            <span className={styles.totalLabel}>Total</span>
            <span className={styles.totalAmount}>{formatINR(totalAmount)}</span>
          </div>
        ) : undefined}
        action={
          <button
            type="button"
            onClick={handleProceedToPayment}
            className="btn btn-primary btn-lg"
            disabled={count === 0 || submitting || started}
            aria-busy={submitting || undefined}
          >
            {submitting ? <><span className="spinner" aria-hidden />Holding your seats…</> : count === 0 ? 'Select seats' : 'Continue'}
          </button>
        }
      />
    </div>
  );
}
