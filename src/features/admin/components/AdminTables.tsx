'use client';

import React, { useState } from 'react';
import { useToast } from '@/features/shared/context/ToastContext';
import { useQueryClient } from '@tanstack/react-query';
import { isMockMode } from '@/lib/config';
import { supabase } from '@/lib/supabaseClient';

const getAuthHeaders = async (customHeaders: Record<string, string> = {}) => {
  const headers: Record<string, string> = { ...customHeaders };
  if (!isMockMode) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }
  return headers;
};

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

const formatEventBadge = (action: string) => {
  switch (action) {
    case 'PAYMENT_VERIFY_FALLBACK_SUCCESS':
    case 'PAYMENT_CAPTURE_SUCCESS':
      return { label: '✅ Ticket Paid', bg: 'rgba(16, 185, 129, 0.15)', color: '#10B981' };
    case 'BOOKING_CONFIRM_CASH_POS':
      return { label: '🎟️ Box Office Cash Sale', bg: 'rgba(212, 175, 55, 0.15)', color: '#E5C158' };
    case 'SEAT_LOCK':
      return { label: '⏳ Seat Selection Hold', bg: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA' };
    case 'SEAT_UNLOCK':
      return { label: '🔓 Hold Released', bg: 'rgba(156, 163, 175, 0.15)', color: '#9CA3AF' };
    case 'SEAT_LOCK_CONFLICT':
      return { label: '⚠️ Seat Conflict', bg: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' };
    case 'WEBHOOK_DUPLICATE_IGNORED':
      return { label: '🔄 System Sync', bg: 'rgba(156, 163, 175, 0.15)', color: '#9CA3AF' };
    default:
      return { label: action.replace(/_/g, ' '), bg: 'rgba(255, 255, 255, 0.08)', color: '#FFFFFF' };
  }
};

const formatDetails = (details: any) => {
  if (!details || typeof details !== 'object') return String(details || '—');

  const parts: string[] = [];
  if (details.amount !== undefined) parts.push(`Amount: ₹${details.amount}`);
  if (details.seatLayoutIds && Array.isArray(details.seatLayoutIds)) {
    parts.push(`${details.seatLayoutIds.length} seat(s) held`);
  }
  if (details.bookingId) {
    const shortId = typeof details.bookingId === 'string' ? details.bookingId.slice(0, 8) : details.bookingId;
    parts.push(`Booking #${shortId}`);
  }
  if (details.orderId) {
    const shortOrder = typeof details.orderId === 'string' ? details.orderId.replace('order_', '#') : details.orderId;
    parts.push(`Order ${shortOrder}`);
  }
  if (details.anonymous === true) {
    parts.push(`Guest Customer`);
  } else if (details.anonymous === false) {
    parts.push(`Registered User`);
  }

  if (parts.length > 0) return parts.join(' • ');

  try {
    return Object.entries(details)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' | ');
  } catch {
    return JSON.stringify(details);
  }
};

export default function AdminTables({ 
  activeLocks, 
  shows, 
  auditLogs, 
  actioning, 
  handleForceReleaseHold 
}: { 
  activeLocks: any[], 
  shows: any[], 
  auditLogs: any[], 
  actioning: string | null, 
  handleForceReleaseHold: (showId: string, seatLayoutId: string, seatLabel: string) => void 
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showRawLogs, setShowRawLogs] = useState(false);
  const [cancellingShowId, setCancellingShowId] = useState<string | null>(null);

  const handleCancelShow = async (showId: string, movieTitle: string, showDate: string, showTime: string) => {
    const timeFormatted = formatTimeLabel(showTime);
    const dateText = showDate ? `on ${showDate} ` : '';
    const confirmMsg = `Are you sure you want to cancel the ${timeFormatted} show of "${movieTitle || 'this movie'}" ${dateText}?\n\nThis will remove the showtime from the schedule.`;
    
    if (!window.confirm(confirmMsg)) return;

    setCancellingShowId(showId);
    try {
      const res = await fetch(`/api/shows?id=${showId}`, {
        method: 'DELETE',
        headers: await getAuthHeaders()
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to cancel showtime.');

      showToast(`Successfully cancelled showtime for "${movieTitle}"!`, 'success');
      queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
    } catch (err: any) {
      showToast(err.message || 'Cannot cancel showtime (it may have active customer bookings).', 'error');
    } finally {
      setCancellingShowId(null);
    }
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '30px'
    }}>
      
      {/* ROW 1: ACTIVE SEAT HOLDS OVERRIDE */}
      <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', fontFamily: 'var(--font-family-heading)' }}>
          ⏳ Active Seat Holds & Locks
        </h3>

        {activeLocks.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No active temporary seat holds currently running.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px' }}>Movie</th>
                  <th style={{ padding: '12px' }}>Screen</th>
                  <th style={{ padding: '12px' }}>Seat</th>
                  <th style={{ padding: '12px' }}>Expires In</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeLocks.map((lock: any) => {
                  const timeLeft = Math.max(0, Math.round((new Date(lock.expiresAt).getTime() - Date.now()) / 1000));
                  const mins = Math.floor(timeLeft / 60);
                  const secs = timeLeft % 60;
                  return (
                    <tr key={lock.seatId} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{lock.movieTitle}</td>
                      <td style={{ padding: '12px' }}>{lock.screenName}</td>
                      <td style={{ padding: '12px', color: 'var(--accent-crimson)', fontWeight: 'bold' }}>{lock.seatLabel}</td>
                      <td style={{ padding: '12px', color: '#F59E0B' }}>{mins}:{secs.toString().padStart(2, '0')}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleForceReleaseHold(lock.showId, lock.seatLayoutId, lock.seatLabel)}
                          disabled={actioning === lock.seatLayoutId}
                          className="btn btn-secondary"
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.75rem',
                            borderColor: 'rgba(239, 68, 68, 0.3)',
                            color: '#EF4444'
                          }}
                        >
                          {actioning === lock.seatLayoutId ? 'Releasing...' : 'Release Hold'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ROW 2: OCCUPANCY PANEL & MANAGE SHOWTIMES */}
      <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', fontFamily: 'var(--font-family-heading)' }}>
          📊 Scheduled Showtimes & Occupancy Telemetry
        </h3>

        {shows.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No showtimes currently scheduled.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            {shows.map((show: any) => (
              <div 
                key={show.id}
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <strong style={{ fontSize: '0.95rem', display: 'block', color: '#FFFFFF' }}>{show.movie?.title}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {show.show_date ? `${show.show_date} • ` : ''}{show.screen?.name || 'Dhrub Talkies'} • {formatTimeLabel(show.show_time)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCancelShow(show.id, show.movie?.title, show.show_date, show.show_time)}
                    disabled={cancellingShowId === show.id}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      color: '#EF4444',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                  >
                    {cancellingShowId === show.id ? 'Cancelling...' : '🗑️ Cancel'}
                  </button>
                </div>

                {/* Custom Occupancy Progress Bar */}
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                    <span>Occupancy</span>
                    <strong>{show.occupancyRate}% ({show.bookedSeats}/{show.totalSeats} seats)</strong>
                  </div>
                  <div style={{ height: '8px', width: '100%', backgroundColor: '#25252E', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${show.occupancyRate}%`,
                      backgroundColor: show.occupancyRate > 75 ? '#10B981' : show.occupancyRate > 40 ? 'var(--highlight-gold)' : 'var(--accent-crimson)',
                      transition: 'width 0.4s ease'
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ROW 3: RECENT ACTIVITY LOGS */}
      <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-family-heading)' }}>
            📜 Recent Activity Log
          </h3>
          <button
            onClick={() => setShowRawLogs(!showRawLogs)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              borderRadius: '6px',
              padding: '5px 10px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {showRawLogs ? '📄 Show Friendly View' : '⚙️ Developer JSON Mode'}
          </button>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px' }}>Time</th>
                <th style={{ padding: '12px' }}>Activity</th>
                <th style={{ padding: '12px' }}>Details</th>
                <th style={{ padding: '12px' }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.slice(0, 50).map((log: any, index: number) => {
                const badge = formatEventBadge(log.action);
                const detailsText = formatDetails(log.details);
                const sourceLabel = log.ip === '127.0.0.1' || log.ip === 'Localhost' || !log.ip ? 'Website / Counter' : log.ip;

                return (
                  <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {new Date(log.created_at || log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        backgroundColor: badge.bg,
                        color: badge.color,
                        display: 'inline-block'
                      }}>
                        {showRawLogs ? log.action : badge.label}
                      </span>
                    </td>
                    <td style={{
                      padding: '12px',
                      color: showRawLogs ? '#F59E0B' : 'var(--text-secondary)',
                      fontFamily: showRawLogs ? 'monospace' : 'inherit',
                      fontSize: showRawLogs ? '0.8rem' : '0.85rem'
                    }}>
                      {showRawLogs ? JSON.stringify(log.details) : detailsText}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {sourceLabel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
