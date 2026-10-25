import React, { useEffect, useRef } from 'react';
import { IndianRupee, Check, X } from 'lucide-react';
import { formatINR } from '@/features/shared/utils/format';

interface MockGatewayModalProps {
  totalAmount: number;
  mockBookingPayload: any;
  customerName: string;
  handleSimulatePaymentSuccess: () => void;
  handleSimulatePaymentFailure: () => void;
}

// Development-only stand-in for the Razorpay window
export default function MockGatewayModal({
  totalAmount, mockBookingPayload, customerName,
  handleSimulatePaymentSuccess, handleSimulatePaymentFailure
}: MockGatewayModalProps) {
  const firstButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { firstButton.current?.focus(); }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      backgroundColor: 'rgba(13, 6, 9, 0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px'
    }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mock-gateway-title"
        style={{
          maxWidth: '420px', width: '100%', padding: '28px',
          backgroundColor: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-gold)', textAlign: 'center', boxShadow: 'var(--shadow-xl)'
        }}
      >
        <span style={{
          width: 52, height: 52, borderRadius: '50%', margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent-bg)', color: 'var(--accent-ink)'
        }}>
          <IndianRupee aria-hidden width={24} height={24} />
        </span>

        <h2 id="mock-gateway-title" style={{ fontSize: 'var(--fs-xl)', marginBottom: 6 }}>Test payment</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', marginBottom: 20 }}>
          Mock mode (development). No real payment happens. Pick an outcome to test.
        </p>

        <dl style={{
          padding: '14px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
          textAlign: 'left', fontSize: 'var(--fs-sm)', marginBottom: 20, display: 'grid', gap: 6
        }}>
          <div><dt style={{ display: 'inline', color: 'var(--text-muted)' }}>Amount: </dt><dd style={{ display: 'inline', fontWeight: 700 }}>{formatINR(totalAmount)}</dd></div>
          <div><dt style={{ display: 'inline', color: 'var(--text-muted)' }}>Order: </dt><dd style={{ display: 'inline', wordBreak: 'break-all' }}>{mockBookingPayload?.razorpayOrderId}</dd></div>
          <div><dt style={{ display: 'inline', color: 'var(--text-muted)' }}>Customer: </dt><dd style={{ display: 'inline' }}>{customerName}</dd></div>
        </dl>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button ref={firstButton} onClick={handleSimulatePaymentSuccess} className="btn btn-primary btn-block">
            <Check aria-hidden />Simulate Payment Success
          </button>
          <button onClick={handleSimulatePaymentFailure} className="btn btn-ghost btn-block" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
            <X aria-hidden />Simulate Payment Failure
          </button>
        </div>
      </div>
    </div>
  );
}
