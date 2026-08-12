'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { useToast } from '@/features/shared/context/ToastContext';
import { ShowType, SeatStatusType } from '@/lib/db';
import { isMockMode } from '@/lib/config';
import { supabase as supabaseClient } from '@/lib/supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CinemaScreen from '@/features/bookings/components/CinemaScreen';
import SeatingGrid from '@/features/bookings/components/SeatingGrid';
import SeatingLegend from '@/features/bookings/components/SeatingLegend';
import CheckoutPanel from '@/features/bookings/components/CheckoutPanel';

interface SeatingMapClientProps {
  show: ShowType;
  initialSeats: SeatStatusType[];
}

export default function SeatingMapClient({ show, initialSeats }: SeatingMapClientProps) {
  const router = useRouter();
  const { user } = useCineBookAuth();
  const { showToast } = useToast();

  const queryClient = useQueryClient();

  const [selectedSeats, setSelectedSeats] = useState<Set<string>>(new Set());
  const [isLocked, setIsLocked] = useState(false);
  const [timer, setTimer] = useState(360); // 6 minutes in seconds
  const [submitting, setSubmitting] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { data: seats = initialSeats, refetch } = useQuery({
    queryKey: ['seats', show.id],
    queryFn: async () => {
      const res = await fetch(`/api/seats/status?showId=${show.id}`);
      if (!res.ok) throw new Error('Failed fetching seats');
      const data = await res.json();
      return data.seats as SeatStatusType[];
    },
    initialData: initialSeats,
    refetchInterval: 4000,
  });

  // ── 0. RESTORE PREVIOUSLY LOCKED SEATS ──────────────
  useEffect(() => {
    if (!hasInitialized && user && seats.length > 0) {
      const myLockedSeats = seats.filter(
        seat => seat.status === 'locked' && 
                seat.locked_by === user.id && 
                seat.lock_expires_at && 
                new Date(seat.lock_expires_at).getTime() > Date.now()
      );
      
      if (myLockedSeats.length > 0) {
        setSelectedSeats(new Set(myLockedSeats.map(s => s.seat_layout_id)));
      }
      setHasInitialized(true);
    }
  }, [hasInitialized, user, seats]);

  // ── 1. REALTIME SEATING POLLING & REALTIME SYNC ──────────────
  useEffect(() => {
    // 1. React Query refetchInterval handles polling now.

    // 2. Setup Realtime subscription in live mode
    let channel: any = null;
    if (!isMockMode) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      channel = supabase
        .channel(`seats-${show.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'seat_status',
            filter: `show_id=eq.${show.id}`
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['seats', show.id] }); // Reload grid on any seat change
          }
        )
        .subscribe();
    }

    return () => {
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [show.id]);

  // Handle countdown expiry - releases holds automatically
  const handleHoldExpiry = async () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setIsLocked(false);
    setTimer(360);
    
    // Unlock held seats in DB
    try {
      await fetch('/api/seats/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId: show.id,
          seatLayoutIds: Array.from(selectedSeats)
        })
      });
      showToast('Your seat hold has expired. Please select seats and check out again.', 'error');
    } catch (err) {
      console.error(err);
    }
    
    setSelectedSeats(new Set());
    // Refresh seat maps
    queryClient.invalidateQueries({ queryKey: ['seats', show.id] });
  };

  // ── 2. COUNTDOWN TIMER SWEEP ─────────────────────────────────
  useEffect(() => {
    if (isLocked && timer > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            handleHoldExpiry();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isLocked, timer]);

  // ── 3. SEAT SELECTION CLICK HANDLERS ─────────────────────────
  const handleSeatClick = (seat: SeatStatusType) => {
    if (isLocked) return; // Cannot modify selection after hold locking
    if (seat.status === 'booked') return;
    
    // If locked by another user
    const isLockedByOther = 
      seat.status === 'locked' && 
      seat.locked_by !== user?.id && 
      seat.lock_expires_at && 
      new Date(seat.lock_expires_at).getTime() > Date.now();
      
    if (isLockedByOther) {
      showToast('This seat is temporarily held by another customer.', 'info');
      return;
    }

    const layoutId = seat.seat_layout_id;
    const newSelected = new Set(selectedSeats);
    
    if (newSelected.has(layoutId)) {
      newSelected.delete(layoutId);
    } else {
      if (newSelected.size >= 10) {
        showToast('You can select a maximum of 10 seats per booking.', 'info');
        return;
      }
      newSelected.add(layoutId);
    }
    
    setSelectedSeats(newSelected);
  };

  // ── 4. ACQUIRE LOCKS AND CHECKOUT ───────────────────────────
  const handleProceedToPayment = async () => {
    if (!user) {
      showToast('Please sign in to book tickets.', 'info');
      router.push(`/login?redirect=/booking/${show.id}`);
      return;
    }

    if (selectedSeats.size === 0) {
      showToast('Please select at least one seat.', 'info');
      return;
    }

    setSubmitting(true);
    try {
      // Get Supabase token if in live mode
      let token = '';
      if (!isMockMode) {
        const { data } = await supabaseClient.auth.getSession();
        token = data.session?.access_token || '';
      }

      // 1. Lock seats via API
      const lockRes = await fetch('/api/seats/lock', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          showId: show.id,
          seatLayoutIds: Array.from(selectedSeats)
        })
      });

      if (!lockRes.ok) {
        const errData = await lockRes.json();
        throw new Error(errData.error || 'Failed to lock selected seats.');
      }

      // Lock success: start client checkout state
      setIsLocked(true);
      setTimer(360);
      showToast('Seats locked successfully! Complete payment within 6 minutes.', 'success');
      
      // Proceed to checkout order setup
      router.push(`/booking/checkout?showId=${show.id}&seats=${Array.from(selectedSeats).join(',')}`);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to secure seat locks. Please try another seat.', 'error');
      
      // Refresh layouts
      queryClient.invalidateQueries({ queryKey: ['seats', show.id] });
    } finally {
      setSubmitting(false);
    }
  };

  // Helper: Format countdown display (e.g. 359 -> "05:59")
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ── 5. RENDER HELPER GRID MAPS ───────────────────────────────
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

  // Calculate dynamic selected ticket price totals
  let totalAmount = 0;
  const selectedSeatLabels: string[] = [];
  
  selectedSeats.forEach((layoutId) => {
    const seat = seats.find(s => s.seat_layout_id === layoutId);
    if (seat && seat.seat_layout) {
      selectedSeatLabels.push(`${seat.seat_layout.row_label}-${seat.seat_layout.seat_number}`);
      
      const category = seat.seat_layout.category;
        const price = {
          classic: (show as any).price_classic ?? (show as any).price_economy ?? (show as any).price_normal ?? 150,
          premium: show.price_premium
        }[category as 'classic' | 'premium'] ?? (show as any).price_classic ?? 150;
      totalAmount += Number(price);
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', alignItems: 'center', width: '100%' }}>
      
      <CinemaScreen />

      <SeatingGrid
        sortedRows={sortedRows}
        rowsMap={rowsMap}
        show={show}
        selectedSeats={selectedSeats}
        handleSeatClick={handleSeatClick}
        user={user}
      />

      <SeatingLegend />

      <CheckoutPanel
        selectedSeatsCount={selectedSeats.size}
        selectedSeatLabels={selectedSeatLabels}
        totalAmount={totalAmount}
        isLocked={isLocked}
        timer={timer}
        submitting={submitting}
        handleProceedToPayment={handleProceedToPayment}
      />
    </div>
  );
}
