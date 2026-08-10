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
        normal: show.price_normal,
        premium: show.price_premium,
        recliner: show.price_recliner
      }[category];
      totalAmount += Number(price);
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', alignItems: 'center', width: '100%' }}>
      
      {/* 1. Curved Cinema Screen Projection (High-Fidelity) */}
      <div style={{ width: '100%', maxWidth: '640px', margin: '20px auto 40px auto', textAlign: 'center', position: 'relative' }}>
        <div style={{
          height: '4px',
          width: '100%',
          background: 'linear-gradient(to right, transparent, var(--highlight-gold), transparent)',
          boxShadow: '0 0 20px rgba(212, 175, 55, 0.8), 0 0 40px rgba(212, 175, 55, 0.4)',
          borderRadius: '50%',
          marginBottom: '15px'
        }} />
        <div style={{
          position: 'absolute',
          top: '4px',
          left: '10%',
          right: '10%',
          height: '50px',
          background: 'linear-gradient(to bottom, rgba(212, 175, 55, 0.06), transparent)',
          clipPath: 'polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)',
          pointerEvents: 'none',
          zIndex: 0
        }} />
        <span style={{ 
          fontSize: '0.75rem', 
          letterSpacing: '5px', 
          color: '#9CA3AF', 
          fontWeight: 700, 
          textTransform: 'uppercase',
          position: 'relative',
          zIndex: 1
        }}>
          ★ DHRUB CINEPLEX SCREEN ★
        </span>
      </div>

      {/* 2. Seating Grid with Row Separation Badges */}
      <div style={{
        overflowX: 'auto',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        paddingBottom: '20px',
        zIndex: 2
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 'fit-content' }}>
          {(() => {
            let lastCategory: string | null = null;
            return sortedRows.map((row) => {
              const rowSeats = rowsMap[row];
              const rowCategory = rowSeats[0]?.seat_layout?.category || 'normal';
              const renderCategoryHeader = rowCategory !== lastCategory;
              lastCategory = rowCategory;

              return (
                <React.Fragment key={row}>
                  {renderCategoryHeader && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      margin: '24px 0 12px 0',
                      width: '100%',
                      justifyContent: 'center'
                    }}>
                      <div style={{ height: '1px', flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' }} />
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        letterSpacing: '1.5px',
                        color: rowCategory === 'recliner' ? 'var(--highlight-gold)' : rowCategory === 'premium' ? '#3B82F6' : '#9CA3AF',
                        textTransform: 'uppercase',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        padding: '4px 14px',
                        borderRadius: '20px',
                        border: '1px solid rgba(255, 255, 255, 0.05)'
                      }}>
                        {rowCategory === 'recliner' ? '💎 VIP Recliner (₹' + show.price_recliner + ')' : rowCategory === 'premium' ? '✨ Premium Club (₹' + show.price_premium + ')' : '🎫 Classic Seat (₹' + show.price_normal + ')'}
                      </span>
                      <div style={{ height: '1px', flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' }} />
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'center' }}>
                    {/* Row Label (Left) */}
                    <span style={{
                      width: '24px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#9CA3AF',
                      fontSize: '0.9rem'
                    }}>
                      {row}
                    </span>

                    {/* Row Seats */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {rowSeats.map((seat) => {
                        const layoutId = seat.seat_layout_id;
                        const isCurrentSelected = selectedSeats.has(layoutId);
                        
                        const isBooked = seat.status === 'booked';
                        const isLockedByOther = !!(
                          seat.status === 'locked' && 
                          seat.locked_by !== user?.id && 
                          seat.lock_expires_at && 
                          new Date(seat.lock_expires_at).getTime() > Date.now()
                        );

                        // Category specific borders
                        const isRecliner = seat.seat_layout?.category === 'recliner';

                        // State-based styles
                        let bg = 'var(--seat-available)';
                        let border = '1px solid var(--seat-available-border)';
                        let cursor = 'pointer';
                        let color = 'var(--text-secondary)';
                        let shadow = 'none';
                        let textDecor = 'none';

                        if (isBooked) {
                          bg = 'var(--seat-booked)';
                          border = '1px solid var(--seat-booked-border)';
                          color = 'var(--text-disabled)';
                          cursor = 'not-allowed';
                          textDecor = 'line-through';
                        } else if (isLockedByOther) {
                          bg = 'var(--seat-locked)';
                          border = '1px solid var(--seat-locked-border)';
                          color = 'var(--gold-400)';
                          cursor = 'not-allowed';
                        } else if (isCurrentSelected) {
                          bg = 'var(--seat-selected)';
                          border = '1px solid var(--seat-selected-border)';
                          color = 'var(--bg-void)';
                          shadow = '0 0 12px var(--gold-glow)';
                        } else if (isRecliner) {
                          border = '1px solid var(--border-gold)';
                          color = 'var(--gold-500)';
                        }

                        return (
                          <button
                            key={seat.id}
                            onClick={() => handleSeatClick(seat)}
                            disabled={isBooked || isLockedByOther}
                            title={`Row ${row} Seat ${seat.seat_layout?.seat_number} - ${seat.seat_layout?.category.toUpperCase()}`}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              backgroundColor: bg,
                              border: border,
                              color: color,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: cursor,
                              boxShadow: shadow,
                              textDecoration: textDecor,
                              transition: 'all 0.15s cubic-bezier(0.165, 0.84, 0.44, 1)'
                            }}
                          >
                            {seat.seat_layout?.seat_number}
                          </button>
                        );
                      })}
                    </div>

                    {/* Row Label (Right) */}
                    <span style={{
                      width: '24px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#9CA3AF',
                      fontSize: '0.9rem'
                    }}>
                      {row}
                    </span>
                  </div>
                </React.Fragment>
              );
            });
          })()}
        </div>
      </div>

      {/* 3. Seating Legends */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '24px',
        justifyContent: 'center',
        padding: '24px',
        borderTop: '1px solid var(--border-subtle)',
        width: '100%',
        zIndex: 2
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <div style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: 'var(--seat-available)', border: '1px solid var(--seat-available-border)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Available Classic</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <div style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: 'var(--seat-available)', border: '1px solid var(--border-gold)' }} />
          <span style={{ color: 'var(--gold-500)' }}>Available Recliner</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <div style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: 'var(--seat-selected)', border: '1px solid var(--seat-selected-border)' }} />
          <span style={{ color: 'var(--text-primary)' }}>Selected</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <div style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: 'var(--seat-locked)', border: '1px solid var(--seat-locked-border)' }} />
          <span style={{ color: 'var(--gold-400)' }}>Held (Locked)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <div style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: 'var(--seat-booked)', border: '1px solid var(--seat-booked-border)' }} />
          <span style={{ color: 'var(--text-muted)' }}>Sold</span>
        </div>
      </div>

      {/* 4. Sticky Bottom Checkout Panel */}
      {selectedSeats.size > 0 && (
        <div className="card" style={{
          width: '100%',
          maxWidth: '560px',
          marginTop: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-gold)',
          boxShadow: 'var(--shadow-xl), 0 0 25px var(--gold-glow)',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '0.85rem', color: '#9CA3AF' }}>Selected Seats</span>
              <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--highlight-gold)', marginTop: '2px' }}>
                {selectedSeatLabels.join(', ')}
              </p>
            </div>
            
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.85rem', color: '#9CA3AF' }}>Total Amount</span>
              <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                ₹{totalAmount}
              </p>
            </div>
          </div>

          {/* Countdown Hold Timer */}
          {isLocked && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px',
              borderRadius: '6px',
              backgroundColor: 'var(--seat-locked)',
              border: '1px solid var(--seat-locked-border)',
              color: 'var(--gold-400)',
              fontSize: '0.9rem',
              fontWeight: 600
            }}>
              ⏳ Seat hold expires in: {formatTimer(timer)}
            </div>
          )}

          <button
            onClick={handleProceedToPayment}
            className="btn btn-gold"
            disabled={submitting}
            style={{ width: '100%', padding: '14px', fontSize: '1rem', borderRadius: '8px', fontWeight: 700 }}
          >
            {submitting 
              ? 'Securing locks...' 
              : isLocked 
                ? 'Proceed to Pay' 
                : `Hold Seats & Pay`}
          </button>
        </div>
      )}

    </div>
  );
}
