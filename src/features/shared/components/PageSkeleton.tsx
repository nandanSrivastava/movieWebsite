import React from 'react';
import Header from './Header';

// Instant loading state for route-level loading.tsx files. Shapes roughly match
// the page that's coming, so nothing jumps when it arrives.
export default function PageSkeleton({ variant, label }: { variant: 'movie' | 'seats' | 'checkout' | 'ticket' | 'list'; label: string }) {
  const block = (h: number | string, w: number | string = '100%', extra: React.CSSProperties = {}) => (
    <div className="skeleton" style={{ height: h, width: w, ...extra }} />
  );

  return (
    <>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 48 }} aria-busy="true">
        <p className="sr-only" role="status">{label}</p>
        {variant === 'movie' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16 }}>
              {block(150, 100, { flexShrink: 0 })}
              <div style={{ flex: 1, display: 'grid', gap: 10, alignContent: 'start' }}>
                {block(36, '70%')}{block(18, '50%')}{block(18, '40%')}
              </div>
            </div>
            {block(56)}{block(120)}{block(80)}
          </div>
        )}
        {variant === 'seats' && (
          <div style={{ display: 'grid', gap: 16 }}>
            {block(44, '60%')}
            <div style={{ display: 'flex', gap: 14 }}>{block(84, 56)}<div style={{ flex: 1, display: 'grid', gap: 8 }}>{block(32, '60%')}{block(18, '45%')}</div></div>
            {block(320, '100%', { marginTop: 12 })}
            {block(40, '80%', { margin: '0 auto' })}
          </div>
        )}
        {variant === 'checkout' && (
          <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
            {block(44, '60%')}{block(48)}{block(140)}{block(260)}
          </div>
        )}
        {variant === 'ticket' && (
          <div style={{ display: 'grid', gap: 16, maxWidth: 420, margin: '0 auto' }}>
            {block(28, '60%', { margin: '0 auto' })}{block(520)}{block(48)}
          </div>
        )}
        {variant === 'list' && (
          <div style={{ display: 'grid', gap: 16 }}>
            {block(40, '40%')}{block(110)}{block(110)}{block(110)}
          </div>
        )}
      </main>
    </>
  );
}
