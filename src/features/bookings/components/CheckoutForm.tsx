import React from 'react';

interface CheckoutFormProps {
  user: any;
  paymentMethod: 'online' | 'cash';
  setPaymentMethod: (m: 'online' | 'cash') => void;
  customerName: string;
  setCustomerName: (n: string) => void;
  customerPhone: string;
  setCustomerPhone: (p: string) => void;
  customerEmail: string;
  setCustomerEmail: (e: string) => void;
  totalAmount: number;
  paying: boolean;
  handleCheckoutSubmit: (e: React.FormEvent) => void;
}

export default function CheckoutForm({
  user, paymentMethod, setPaymentMethod, customerName, setCustomerName,
  customerPhone, setCustomerPhone, customerEmail, setCustomerEmail,
  totalAmount, paying, handleCheckoutSubmit
}: CheckoutFormProps) {
  return (
    <div style={{ 
      backgroundColor: 'var(--bg-card)', 
      border: '1px solid var(--border-subtle)',
      padding: '32px',
      borderRadius: '16px',
      boxShadow: 'var(--shadow-lg)'
    }}>
      <h4 style={{ 
        fontSize: '1.25rem', 
        fontWeight: 800, 
        marginBottom: '24px', 
        fontFamily: 'var(--font-family-heading)',
        color: '#FFFFFF'
      }}>
        Contact Information
      </h4>

      <form onSubmit={handleCheckoutSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {user && ['admin', 'member'].includes(user.role) && (
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--highlight-gold)', fontWeight: 700 }}>Payment Mode Override</label>
            <select
              className="form-control"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'online' | 'cash')}
              disabled={paying}
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
                color: '#FFFFFF',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '0.95rem'
              }}
            >
              <option value="online">UPI / Card Payment (Razorpay)</option>
              <option value="cash">Counter Cash Sale (Counter Instant Confirmation)</option>
            </select>
          </div>
        )}

        <div className="form-group">
          <label className="form-label" style={{ fontWeight: 600 }}>Customer Name</label>
          <input
            type="text"
            className="form-control"
            placeholder="Enter full name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
            disabled={paying}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.01)',
              border: '1px solid var(--border-subtle)',
              color: '#FFFFFF',
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '0.95rem',
              width: '100%',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div className="form-group">
          <label className="form-label" style={{ fontWeight: 600 }}>Phone Number</label>
          <input
            type="tel"
            className="form-control"
            placeholder="Enter 10-digit mobile number"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            required
            disabled={paying}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.01)',
              border: '1px solid var(--border-subtle)',
              color: '#FFFFFF',
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '0.95rem',
              width: '100%',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div className="form-group">
          <label className="form-label" style={{ fontWeight: 600 }}>
            Email <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem' }}>(Optional)</span>
          </label>
          <input
            type="email"
            className="form-control"
            placeholder="name@example.com"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            disabled={paying}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.01)',
              border: '1px solid var(--border-subtle)',
              color: '#FFFFFF',
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '0.95rem',
              width: '100%',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
            Your ticket will be emailed automatically if provided. You can also retrieve it later on our <a href="/booking/lookup" style={{ color: 'var(--highlight-gold)', textDecoration: 'underline' }}>Ticket Lookup</a> page using your phone number.
          </span>
        </div>

        {/* Total amount bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px',
          backgroundColor: 'rgba(255, 255, 255, 0.01)',
          borderRadius: '12px',
          border: '1px solid var(--border-subtle)',
          margin: '10px 0'
        }}>
          <span style={{ fontWeight: 600, color: '#9CA3AF' }}>Total Amount</span>
          <span style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--highlight-gold)' }}>₹{totalAmount}</span>
        </div>

        <button
          type="submit"
          className="btn btn-gold"
          style={{ width: '100%', padding: '15px', fontSize: '1rem', borderRadius: '8px', fontWeight: 800 }}
          disabled={paying}
        >
          {paying 
            ? 'Processing Order...' 
            : paymentMethod === 'cash' 
              ? `Confirm Cash Sale (₹${totalAmount})` 
              : `Proceed to Pay ₹${totalAmount}`}
        </button>
      </form>
    </div>
  );
}
