import React from 'react';

interface MockGatewayModalProps {
  totalAmount: number;
  mockBookingPayload: any;
  customerName: string;
  handleSimulatePaymentSuccess: () => void;
  handleSimulatePaymentFailure: () => void;
}

export default function MockGatewayModal({
  totalAmount, mockBookingPayload, customerName,
  handleSimulatePaymentSuccess, handleSimulatePaymentFailure
}: MockGatewayModalProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, width: '100%', height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backdropFilter: 'blur(12px)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '460px',
        width: '100%',
        padding: '36px',
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-gold)',
        textAlign: 'center',
        boxShadow: 'var(--shadow-xl), 0 0 30px var(--gold-glow)'
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: 'rgba(197, 168, 128, 0.1)',
          color: 'var(--highlight-gold)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          margin: '0 auto 20px auto',
          fontWeight: 'bold'
        }}>
          ₹
        </div>

        <h3 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: '8px', color: '#FFFFFF', fontFamily: 'var(--font-family-heading)' }}>
          Simulated Razorpay Gateway
        </h3>
        <p style={{ color: '#9CA3AF', fontSize: '0.9rem', marginBottom: '24px', lineHeight: 1.5 }}>
          You are running in development Mock Mode. You can test success/failure payment scenarios instantly.
        </p>

        <div style={{
          padding: '16px',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          textAlign: 'left',
          fontSize: '0.85rem',
          color: '#E5E7EB',
          marginBottom: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <p>💵 <strong>Amount:</strong> ₹{totalAmount}</p>
          <p>📦 <strong>Order ID:</strong> {mockBookingPayload?.razorpayOrderId}</p>
          <p>👤 <strong>Customer:</strong> {customerName}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button 
            onClick={handleSimulatePaymentSuccess}
            className="btn btn-gold"
            style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}
          >
            ✓ Simulate Payment Success
          </button>
          <button 
            onClick={handleSimulatePaymentFailure}
            className="btn btn-secondary"
            style={{ 
              width: '100%', 
              padding: '12px', 
              fontSize: '0.95rem',
              borderColor: 'rgba(150, 40, 40, 0.3)', 
              color: '#FF4D55',
              backgroundColor: 'rgba(150, 40, 40, 0.05)'
            }}
          >
            ✕ Simulate Payment Failure
          </button>
        </div>
      </div>
    </div>
  );
}
