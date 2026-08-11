import React from 'react';

interface CheckoutPanelProps {
  selectedSeatsCount: number;
  selectedSeatLabels: string[];
  totalAmount: number;
  isLocked: boolean;
  timer: number;
  submitting: boolean;
  handleProceedToPayment: () => void;
}

const formatTimer = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function CheckoutPanel({
  selectedSeatsCount,
  selectedSeatLabels,
  totalAmount,
  isLocked,
  timer,
  submitting,
  handleProceedToPayment
}: CheckoutPanelProps) {
  if (selectedSeatsCount === 0) return null;

  return (
    <div className="card" style={{
      width: '100%',
      maxWidth: '560px',
      marginTop: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border-gold)',
      boxShadow: 'var(--shadow-xl), 0 0 25px var(--gold-glow)',
      zIndex: 10
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '0.85rem', color: '#9CA3AF' }}>Selected Seats</span>
          <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--highlight-gold)', marginTop: '2px' }}>
            {selectedSeatLabels.join(', ')}
          </p>
        </div>
        
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.85rem', color: '#9CA3AF' }}>Total Amount</span>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
            ₹{totalAmount}
          </p>
        </div>
      </div>

      {/* Countdown Hold Timer */}
      {isLocked && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '10px',
          borderRadius: '6px',
          backgroundColor: 'var(--seat-locked)',
          border: '1px solid var(--seat-locked-border)',
          color: 'var(--gold-400)',
          fontSize: '0.9rem',
          fontWeight: 600
        }}>
          ⏳ Seat hold expires in: {formatTimer(timer)}
        </div>
      )}

      <button
        onClick={handleProceedToPayment}
        className="btn btn-gold"
        disabled={submitting}
        style={{ width: '100%', padding: '14px', fontSize: '1rem', borderRadius: '8px', fontWeight: 700 }}
      >
        {submitting 
          ? 'Securing locks...' 
          : isLocked 
            ? 'Proceed to Pay' 
            : `Hold Seats & Pay`}
      </button>
    </div>
  );
}
