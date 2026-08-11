'use client';

import React from 'react';

export default function AdminStats({ totalPaidRevenue, totalTicketsSold, activeLocksCount }: { totalPaidRevenue: number, totalTicketsSold: number, activeLocksCount: number }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '20px',
      marginBottom: '40px'
    }}>
      <div className="card" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '24px' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Revenue</span>
        <h3 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--highlight-gold)', marginTop: '8px' }}>₹{totalPaidRevenue}</h3>
      </div>
      <div className="card" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '24px' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Tickets Confirmed</span>
        <h3 style={{ fontSize: '2rem', fontWeight: 800, color: '#FFFFFF', marginTop: '8px' }}>{totalTicketsSold} sold</h3>
      </div>
      <div className="card" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '24px' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active Seat Holds</span>
        <h3 style={{ fontSize: '2rem', fontWeight: 800, color: '#F59E0B', marginTop: '8px' }}>{activeLocksCount} locked</h3>
      </div>
    </div>
  );
}
