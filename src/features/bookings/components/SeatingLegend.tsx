import React from 'react';

export default function SeatingLegend() {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '20px',
      justifyContent: 'center',
      padding: '20px 24px',
      borderTop: '1px solid var(--border-subtle)',
      width: '100%',
      zIndex: 2
    }}>
      {/* Economy available */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
        <div style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: 'var(--seat-available)', border: '1px solid var(--seat-available-border)' }} />
        <span style={{ color: 'var(--text-secondary)' }}>Classic</span>
      </div>
      {/* Premium available */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
        <div style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: 'var(--seat-available)', border: '1px solid var(--border-gold)' }} />
        <span style={{ color: 'var(--gold-500)' }}>Premium</span>
      </div>
      {/* Selected */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
        <div style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: 'var(--seat-selected)', border: '1px solid var(--seat-selected-border)' }} />
        <span style={{ color: 'var(--text-primary)' }}>Selected</span>
      </div>
      {/* Held */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
        <div style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: 'var(--seat-locked)', border: '1px solid var(--seat-locked-border)' }} />
        <span style={{ color: 'var(--gold-400)' }}>Held</span>
      </div>
      {/* Sold */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
        <div style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: 'var(--seat-booked)', border: '1px solid var(--seat-booked-border)' }} />
        <span style={{ color: 'var(--text-muted)' }}>Sold</span>
      </div>
    </div>
  );
}
