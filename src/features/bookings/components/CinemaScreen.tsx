import React from 'react';

// The screen as a lit, curved strip at the front of the hall, with a soft
// spill of light toward the seats. Drawn inside the seat map so it scales with it.
export default function CinemaScreen() {
  return (
    <div style={{ position: 'relative', width: '70%', margin: '4px auto 18px', textAlign: 'center' }}>
      <svg viewBox="0 0 400 40" width="100%" height="34" aria-hidden preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="screen-strip" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="0.5" stopColor="var(--accent)" stopOpacity="1" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="screen-spill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 14 Q200 -6 400 14 L380 40 Q200 22 20 40 Z" fill="url(#screen-spill)" />
        <path d="M0 14 Q200 -6 400 14" fill="none" stroke="url(#screen-strip)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Screen</span>
    </div>
  );
}
