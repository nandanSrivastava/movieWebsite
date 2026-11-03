'use client';

import React from 'react';
import { formatINR } from '@/features/shared/utils/format';
import type { SalesSummary } from '@/lib/types';

// Null means the figures couldn't be loaded. That must never read as ₹0.
export default function AdminStats({ stats, activeLocksCount }: { stats: SalesSummary | null, activeLocksCount: number }) {
  return (
    <>
      {!stats && (
        <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '12px' }}>
          Sales figures couldn&apos;t be loaded just now. They&apos;re unknown, not zero. This page keeps trying by itself.
        </p>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
        marginBottom: '40px'
      }}>
        <div className="card" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '24px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Revenue</span>
          <h3 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--highlight-gold)', marginTop: '8px' }}>{stats ? formatINR(stats.paidRevenue) : '—'}</h3>
        </div>
        <div className="card" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '24px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Tickets Confirmed</span>
          <h3 style={{ fontSize: '2rem', fontWeight: 800, color: '#FFFFFF', marginTop: '8px' }}>{stats ? `${stats.ticketsSold} sold` : '—'}</h3>
        </div>
        <div className="card" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '24px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active Seat Holds</span>
          <h3 style={{ fontSize: '2rem', fontWeight: 800, color: '#F59E0B', marginTop: '8px' }}>{activeLocksCount} locked</h3>
        </div>
        <div className="card" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '24px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Refunds Waiting</span>
          <h3 style={{ fontSize: '2rem', fontWeight: 800, color: stats?.refundsPending ? '#EF4444' : '#10B981', marginTop: '8px' }}>{stats ? stats.refundsPending : '—'}</h3>
          {!!stats?.refundsPending && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '6px 0 0' }}>Retried automatically. If this stays high, check Razorpay and the audit log.</p>
          )}
        </div>
      </div>
    </>
  );
}
