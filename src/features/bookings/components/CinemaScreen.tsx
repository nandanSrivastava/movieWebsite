import React from 'react';

export default function CinemaScreen() {
  return (
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
  );
}
