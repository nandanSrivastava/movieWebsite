'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authHeaders } from '@/lib/authHeaders';
import { istDateString } from '@/lib/istDate';
import { formatINR, formatShowDate, formatShowTime, seatLabel } from '@/features/shared/utils/format';
import { refundReasonText } from '@/features/shared/utils/refundReasons';
import type { BookingTotals } from '@/features/admin/utils/bookingTotals';

const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  refund_pending: 'Refund on its way',
  refunded: 'Refunded',
};

// The owner's day-end check: what came in for one day's shows, by cash and online
export default function AdminBookings() {
  const [date, setDate] = useState(() => istDateString());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['adminBookings', date],
    queryFn: async (): Promise<{ bookings: any[]; totals: BookingTotals }> => {
      const res = await fetch(`/api/admin/bookings?date=${date}`, { headers: await authHeaders() });
      if (!res.ok) throw new Error('Could not load bookings');
      return res.json();
    },
    enabled: !!date,
    refetchInterval: 30_000,
  });

  const totals = data?.totals;
  const bookings = data?.bookings ?? [];
  const figures = totals ? [
    { label: 'Collected', value: formatINR(totals.collected) },
    { label: 'Online', value: formatINR(totals.online) },
    { label: 'Cash', value: formatINR(totals.cash) },
    { label: 'Tickets', value: String(totals.tickets) },
    { label: 'Refunded', value: formatINR(totals.refunded) },
    { label: 'Refunds on their way', value: formatINR(totals.refundsPending) },
  ] : [];

  return (
    <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-family-heading)' }}>
            Bookings for {formatShowDate(date, { withYear: true })}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, marginTop: '4px' }}>
            Every paid or refunded booking for that day&apos;s shows.
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Show date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ background: '#1F1F27', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 10px', color: 'var(--text-primary)', colorScheme: 'dark' }}
          />
        </label>
      </div>

      {isError && (
        <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>
          Couldn&apos;t load these bookings. These figures are unknown, not zero.{' '}
          <button type="button" onClick={() => refetch()} style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', fontWeight: 700 }}>Try again</button>
        </p>
      )}

      {isLoading && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading bookings…</p>}

      {totals && (
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', margin: '0 0 20px' }}>
          {figures.map(({ label, value }) => (
            <div key={label} style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px' }}>
              <dt style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</dt>
              <dd style={{ margin: '4px 0 0', fontSize: '1.2rem', fontWeight: 800 }}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {data && bookings.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No bookings for this date.</p>
      )}

      {bookings.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px' }}>Show</th>
                <th style={{ padding: '10px' }}>Customer</th>
                <th style={{ padding: '10px' }}>Seats</th>
                <th style={{ padding: '10px' }}>Paid by</th>
                <th style={{ padding: '10px' }}>Amount</th>
                <th style={{ padding: '10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b: any) => (
                <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px' }}>
                    <strong style={{ display: 'block' }}>{b.show?.movie?.title ?? 'Movie'}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {b.show?.show_time ? formatShowTime(b.show.show_time) : ''}{b.show?.cancelled_at ? ' · cancelled' : ''}
                    </span>
                  </td>
                  <td style={{ padding: '10px' }}>
                    {b.customer_name || 'Customer'}
                    <span style={{ display: 'block', color: 'var(--text-muted)' }}>{b.customer_phone || ''}</span>
                  </td>
                  <td style={{ padding: '10px' }}>
                    {b.booking_seats?.map((s: any) => seatLabel(s.seat_layout?.row_label, s.seat_layout?.seat_number)).join(', ')}
                  </td>
                  <td style={{ padding: '10px' }}>{b.booking_channel === 'counter' ? 'Cash' : 'Online'}</td>
                  <td style={{ padding: '10px', fontWeight: 700 }}>{formatINR(b.total_amount)}</td>
                  <td style={{ padding: '10px' }} title={b.refund_reason ? refundReasonText(b.refund_reason) : undefined}>
                    {STATUS_LABEL[b.payment_status] ?? b.payment_status}
                    {b.checked_in_at && <span style={{ display: 'block', color: 'var(--text-muted)' }}>Used at the gate</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
