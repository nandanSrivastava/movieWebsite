'use client';

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TriangleAlert, RefreshCw, Clock } from 'lucide-react';
import { useToast } from '@/features/shared/context/ToastContext';
import { useServerOffset } from '@/features/shared/hooks/useServerClock';
import { ShowType, SeatStatusType } from '@/lib/db';
import { authHeaders } from '@/lib/authHeaders';
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

type SeatStatuses = Record<string, SeatStatusType['status']>;

// navigator.cookieEnabled can say yes when a block-all setting is on, so actually try one
function cookiesWork(): boolean {
  if (!navigator.cookieEnabled) return false;
  document.cookie = 'dt_cookie_check=1; path=/; max-age=60; SameSite=Lax';
  const stored = document.cookie.includes('dt_cookie_check=1');
  document.cookie = 'dt_cookie_check=; path=/; max-age=0';
  return stored;
}

export default function SeatingMapClient({ show, initialSeats, showStarted = false }: SeatingMapClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const serverOffset = useServerOffset();

  const [selectedSeats, setSelectedSeats] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [cookiesBlocked, setCookiesBlocked] = useState(false);
  const [pollInterval] = useState(() => POLL_BASE_MS + Math.floor(Math.random() * POLL_JITTER_MS));
  const [started, setStarted] = useState(showStarted);

  // The CDN keeps a few-second copy of the seat map. Right after this customer
  // changes a seat that copy is out of date, so the next read goes around it.
  const freshRead = useRef(false);
  const fetchStatuses = useCallback(async (): Promise<SeatStatuses> => {
    const bust = freshRead.current ? `&fresh=${Date.now()}` : '';
    freshRead.current = false;
    const res = await fetch(`/api/seats/status?showId=${show.id}${bust}`);
    if (!res.ok) throw new Error('Failed fetching seats');
    const data = await res.json();
    return Object.fromEntries((data.seats as { seat_layout_id: string; status: SeatStatusType['status'] }[])
      .map(seat => [seat.seat_layout_id, seat.status]));
  }, [show.id]);

  const fetchHolds = useCallback(async (): Promise<string[]> => {
    const res = await fetch(`/api/seats/holds?showId=${show.id}`, { headers: await authHeaders() });
    if (!res.ok) throw new Error('Failed fetching holds');
    return (await res.json()).seatLayoutIds;
  }, [show.id]);

  const seatsKey = useMemo(() => ['seats', show.id], [show.id]);
  const holdsKey = useMemo(() => ['seatHolds', show.id], [show.id]);

  const { data: statusById, isError: refreshFailed } = useQuery({
    queryKey: seatsKey,
    queryFn: fetchStatuses,
    // The page HTML is cached for a few seconds, so refresh statuses right away
    initialData: () => Object.fromEntries(initialSeats.map(seat => [seat.seat_layout_id, seat.status])) as SeatStatuses,
    initialDataUpdatedAt: 0,
    refetchInterval: pollInterval,
    staleTime: 0,
    retry: 1,
  });

  // The seats this browser holds. Kept up to date while there are any, so a hold
  // that runs out here doesn't go on looking like this customer's seat.
  const { data: heldIds, isFetchedAfterMount: holdsLoaded } = useQuery({
    queryKey: holdsKey,
    queryFn: fetchHolds,
    refetchInterval: query => (query.state.data?.length ? pollInterval : false),
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });
  const heldByMe = useMemo(() => new Set(heldIds ?? []), [heldIds]);

  // The page can sit open past showtime; close booking when the show begins.
  // Waits for the server's clock: this phone's may be wrong.
  useEffect(() => {
    if (started || serverOffset === null) return;
    const check = () => { if (hasShowStarted(show.show_date, show.show_time, Date.now() + serverOffset)) setStarted(true); };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [started, serverOffset, show.show_date, show.show_time]);

  // Seats this browser already holds (e.g. came back from checkout) start selected
  const restoredHolds = useRef(false);
  useEffect(() => {
    if (restoredHolds.current || !holdsLoaded || !heldIds) return;
    restoredHolds.current = true;
    if (heldIds.length > 0) setSelectedSeats(prev => new Set([...Array.from(prev), ...heldIds]));
  }, [holdsLoaded, heldIds]);

  const seats = useMemo(
    () => initialSeats.map(seat => ({ ...seat, status: statusById?.[seat.seat_layout_id] ?? seat.status })),
    [initialSeats, statusById]
  );

  // A seat this customer picked may have gone to someone else. The map can be a
  // few seconds old and their own released hold can look like a stranger's, so
  // ask again before telling them they lost it.
  const checkingLostSeats = useRef(false);
  useEffect(() => {
    const suspects = Array.from(selectedSeats).filter((id) => {
      const status = statusById?.[id];
      return status === 'booked' || (status === 'locked' && !heldByMe.has(id));
    });
    if (suspects.length === 0 || checkingLostSeats.current) return;

    checkingLostSeats.current = true;
    freshRead.current = true;
    Promise.all([
      queryClient.fetchQuery({ queryKey: seatsKey, queryFn: fetchStatuses, staleTime: 0 }),
      queryClient.fetchQuery({ queryKey: holdsKey, queryFn: fetchHolds, staleTime: 0 }),
    ]).then(([latest, mine]) => {
      const lost = suspects.filter(id => latest[id] === 'booked' || (latest[id] === 'locked' && !mine.includes(id)));
      if (lost.length > 0) {
        setSelectedSeats(prev => new Set(Array.from(prev).filter(id => !lost.includes(id))));
        showToast('A seat you picked was just taken by another customer.', 'info');
      }
    }).catch(() => {
      // Offline: Continue asks the server anyway, and it won't sell a taken seat
    }).finally(() => { checkingLostSeats.current = false; });
  }, [statusById, selectedSeats, heldByMe, showToast, queryClient, seatsKey, holdsKey, fetchStatuses, fetchHolds]);

  // Deselecting a held seat lets it go right away, instead of keeping everyone
  // else off it until the hold runs out.
  const releaseSeat = (layoutId: string) => {
    queryClient.setQueryData<string[]>(holdsKey, ids => ids?.filter(id => id !== layoutId));
    queryClient.setQueryData<SeatStatuses>(seatsKey, statuses => statuses && { ...statuses, [layoutId]: 'available' });
    authHeaders()
      .then(headers => fetch('/api/seats/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ showId: show.id, seatLayoutIds: [layoutId] }),
        keepalive: true,
      }))
      .catch(() => {
        // The hold ends on its own
      })
      .finally(() => {
        freshRead.current = true;
        queryClient.invalidateQueries({ queryKey: seatsKey });
      });
  };

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
      if (heldByMe.has(layoutId)) releaseSeat(layoutId);
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

    // Guests are told apart by a cookie, so without cookies a seat can't be held for them
    if (!cookiesWork()) {
      setCookiesBlocked(true);
      return;
    }
    setCookiesBlocked(false);

    setSubmitting(true);
    try {
      // Guests are identified by an httpOnly cookie the server sets on this call
      const lockRes = await fetch('/api/seats/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ showId: show.id, seatLayoutIds: Array.from(selectedSeats) })
      });

      if (!lockRes.ok) {
        const errData = await lockRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to hold the selected seats.');
      }

      queryClient.setQueryData<string[]>(holdsKey, Array.from(selectedSeats));
      router.push(`/booking/checkout?showId=${show.id}&seats=${Array.from(selectedSeats).join(',')}`);
    } catch (err: any) {
      console.error(err);
      const offline = err instanceof TypeError;
      showToast(offline ? 'We couldn’t reach the server. Check your connection and try again.' : err.message || 'Failed to hold seats. Please try another seat.', 'error');
      freshRead.current = true;
      queryClient.invalidateQueries({ queryKey: seatsKey });
      queryClient.invalidateQueries({ queryKey: holdsKey });
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
      {cookiesBlocked && (
        <div className="notice notice-danger" role="alert">
          <TriangleAlert aria-hidden />
          <div>
            <strong>Your browser is blocking cookies.</strong> We use one to hold your seats while you pay. Allow cookies for this site, then press Continue again.
          </div>
        </div>
      )}
      {seats.length === 0 && (
        <div className="notice notice-accent" role="status">
          <TriangleAlert aria-hidden />
          <div>
            <strong>Seats for this show aren&apos;t available online.</strong>{' '}
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
