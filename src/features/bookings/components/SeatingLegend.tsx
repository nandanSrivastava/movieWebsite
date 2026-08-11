import React from 'react';

export default function SeatingLegend() {
  return (
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
  );
}
