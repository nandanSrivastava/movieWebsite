import React from 'react';
import { ShowType } from '@/lib/db';

interface BookingSummaryCardProps {
  show: ShowType;
  selectedSeatLabels: string[];
  seatCount: number;
}

export default function BookingSummaryCard({ show, selectedSeatLabels, seatCount }: BookingSummaryCardProps) {
  return (
    <div style={{ 
      background: 'linear-gradient(135deg, rgba(18, 18, 24, 0.7) 0%, rgba(11, 11, 14, 0.85) 100%)',
      backdropFilter: 'blur(12px)',
      border: '1px solid var(--border-subtle)',
      padding: '32px',
      borderRadius: '16px',
      boxShadow: 'var(--shadow-lg)'
    }}>
      <span style={{ 
        fontSize: '0.75rem', 
        color: 'var(--highlight-gold)', 
        fontWeight: 800, 
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        backgroundColor: 'rgba(197, 168, 128, 0.1)',
        padding: '3px 8px',
        borderRadius: '4px'
      }}>
        Booking Summary
      </span>
      
      <h3 style={{ 
        fontSize: '1.7rem', 
        fontWeight: 800, 
        margin: '12px 0 20px 0', 
        fontFamily: 'var(--font-family-heading)',
        color: '#FFFFFF'
      }}>
        {show.movie?.title}
      </h3>
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '14px', 
        fontSize: '0.95rem', 
        color: '#E5E7EB',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        paddingTop: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#9CA3AF' }}>🏛️ Screen:</span>
          <strong style={{ color: 'var(--highlight-gold)' }}>Dhrub Talkies</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#9CA3AF' }}>📅 Date:</span>
          <strong>{new Date(show.show_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#9CA3AF' }}>🕒 Time:</span>
          <strong>{show.show_time.substring(0, 5)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#9CA3AF' }}>🎫 Selected Seats:</span>
          <strong style={{ color: 'var(--highlight-gold)' }}>{selectedSeatLabels.join(', ')}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#9CA3AF' }}>🎟️ Total Tickets:</span>
          <strong>{seatCount}</strong>
        </div>
      </div>
    </div>
  );
}
