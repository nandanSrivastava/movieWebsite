'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useToast } from '@/features/shared/context/ToastContext';
import BookingSummaryCard from '@/features/bookings/components/BookingSummaryCard';
import CheckoutForm from '@/features/bookings/components/CheckoutForm';
import MockGatewayModal from '@/features/bookings/components/MockGatewayModal';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function CheckoutClient({
  showId,
  seatLayoutIds,
  show,
  selectedSeatLabels,
  totalAmount,
  user
}: {
  showId: string;
  seatLayoutIds: string[];
  show: any;
  selectedSeatLabels: string[];
  totalAmount: number;
  user: any;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [paying, setPaying] = useState(false);

  // Form Fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cash'>('online');
  
  // Simulated Modal State
  const [showMockGateway, setShowMockGateway] = useState(false);
  const [mockBookingPayload, setMockBookingPayload] = useState<any>(null);

  useEffect(() => {
    if (user) {
      setCustomerName(user.full_name || '');
      setCustomerPhone(user.phone || '');
      setCustomerEmail(user.email || '');
    }
  }, [user]);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone) {
      showToast('Please enter your name and phone number.', 'info');
      return;
    }

    setPaying(true);
    try {
      const idempotencyKey = generateUUID();

      const res = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId,
          seatLayoutIds,
          customerName,
          customerPhone,
          customerEmail: customerEmail.trim(),
          idempotencyKey,
          paymentMethod
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create booking order.');
      }

      const orderData = await res.json();

      if (orderData.isCash) {
        showToast('Direct Cash Booking Confirmed!', 'success');
        router.replace(`/booking/confirmation/${orderData.bookingId}`);
        return;
      }

      if (orderData.isMock) {
        setMockBookingPayload(orderData);
        setShowMockGateway(true);
      } else {
        triggerRazorpayPayment(orderData);
      }

    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Checkout failed. Please try again.', 'error');
      setPaying(false);
    }
  };

  const triggerRazorpayPayment = (order: any) => {
    if (!(window as any).Razorpay) {
      showToast('Razorpay payment gateway not loaded. Please refresh.', 'error');
      setPaying(false);
      return;
    }

    const options = {
      key: order.keyId,
      amount: Math.round(order.amount * 100),
      currency: 'INR',
      name: 'Dhrub Cineplex',
      description: 'Movie Ticket Booking',
      order_id: order.razorpayOrderId,
      prefill: {
        name: order.customerName,
        contact: order.customerPhone
      },
      handler: function (response: any) {
        showToast('Payment successful! Verifying tickets...', 'success');
        router.replace(`/booking/confirmation/${order.bookingId}?paymentId=${response.razorpay_payment_id}`);
      },
      modal: {
        ondismiss: function () {
          showToast('Payment checkout dismissed.', 'info');
          setPaying(false);
        }
      },
      theme: {
        color: '#E50914'
      }
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  const handleSimulatePaymentSuccess = async () => {
    if (!mockBookingPayload) return;
    setPaying(true);
    
    try {
      const res = await fetch('/api/checkout/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mock-payment': 'true'
        },
        body: JSON.stringify({
          bookingId: mockBookingPayload.bookingId,
          orderId: mockBookingPayload.razorpayOrderId,
          paymentId: `pay_mock_${Math.random().toString(36).substring(2, 9)}`,
          eventId: `evt_mock_${Math.random().toString(36).substring(2, 9)}`
        })
      });

      if (!res.ok) throw new Error('Mock webhook delivery failed');
      const data = await res.json();

      if (data.status === 'confirmed') {
        showToast('Payment Capture Success! Booking confirmed.', 'success');
        router.replace(`/booking/confirmation/${mockBookingPayload.bookingId}`);
      } else {
        throw new Error(data.status || 'Checkout confirmation conflict.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Simulation verification failed.', 'error');
      setPaying(false);
      setShowMockGateway(false);
    }
  };

  const handleSimulatePaymentFailure = async () => {
    showToast('Payment simulated as FAILED. Hold released.', 'error');
    
    try {
      await fetch('/api/seats/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId,
          seatLayoutIds
        })
      });
    } catch {}

    setPaying(false);
    setShowMockGateway(false);
    router.replace(`/booking/${showId}`);
  };

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '36px' }}>
        <h2 style={{ 
          fontSize: '2.2rem', 
          fontWeight: 800, 
          fontFamily: 'var(--font-family-heading)',
          color: '#FFFFFF',
          letterSpacing: '-1px',
          margin: 0
        }}>
          Review & Finalize Order
        </h2>
        <button
          onClick={() => router.back()}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#FFFFFF',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontFamily: 'var(--font-family-base)',
            fontSize: '0.9rem',
            fontWeight: 600,
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          ← Go Back
        </button>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
        gap: '36px',
        alignItems: 'start'
      }}>
        
        {show && (
          <BookingSummaryCard 
            show={show} 
            selectedSeatLabels={selectedSeatLabels} 
            seatCount={seatLayoutIds.length} 
          />
        )}

        <CheckoutForm
          user={user}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          customerName={customerName}
          setCustomerName={setCustomerName}
          customerPhone={customerPhone}
          setCustomerPhone={setCustomerPhone}
          customerEmail={customerEmail}
          setCustomerEmail={setCustomerEmail}
          totalAmount={totalAmount}
          paying={paying}
          handleCheckoutSubmit={handleCheckoutSubmit}
        />

      </div>

      {showMockGateway && (
        <MockGatewayModal
          totalAmount={totalAmount}
          mockBookingPayload={mockBookingPayload}
          customerName={customerName}
          handleSimulatePaymentSuccess={handleSimulatePaymentSuccess}
          handleSimulatePaymentFailure={handleSimulatePaymentFailure}
        />
      )}
    </>
  );
}
