'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { useToast } from '@/features/shared/context/ToastContext';
import { ShowType, SeatStatusType } from '@/lib/db';
import { useQuery } from '@tanstack/react-query';
import BookingSummaryCard from '@/features/bookings/components/BookingSummaryCard';
import CheckoutForm from '@/features/bookings/components/CheckoutForm';
import MockGatewayModal from '@/features/bookings/components/MockGatewayModal';

// RFC-4122 Compliant UUID Generator
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function CheckoutPage() {
  return (
    <React.Suspense fallback={
      <div style={{ backgroundColor: 'var(--bg-void)', color: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h3 style={{ fontFamily: 'var(--font-family-heading)', fontWeight: 700 }}>Loading checkout session...</h3>
      </div>
    }>
      <CheckoutContent />
    </React.Suspense>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useCineBookAuth();
  const { showToast } = useToast();

  const showId = searchParams.get('showId') || '';
  const seatIdsStr = searchParams.get('seats') || '';
  const seatLayoutIds = seatIdsStr ? seatIdsStr.split(',') : [];

  const [paying, setPaying] = useState(false);

  // Form Fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cash'>('online');
  
  // Simulated Modal State
  const [showMockGateway, setShowMockGateway] = useState(false);
  const [mockBookingPayload, setMockBookingPayload] = useState<any>(null);

  // Load user data when session resolves
  useEffect(() => {
    if (user) {
      setCustomerName(user.full_name || '');
      setCustomerPhone(user.phone || '');
    }
  }, [user]);

  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['checkoutDetails', showId],
    queryFn: async () => {
      const [seatsRes, showsRes] = await Promise.all([
        fetch(`/api/seats/status?showId=${showId}`),
        fetch('/api/shows')
      ]);
      
      if (!seatsRes.ok) throw new Error('Failed to load show seats details');
      
      const seatsData = await seatsRes.json();
      let showMatch = null;
      if (showsRes.ok) {
        const showsData = await showsRes.json();
        showMatch = showsData.shows?.find((s: any) => s.id === showId) || null;
      }
      
      return {
        seats: seatsData.seats as SeatStatusType[],
        show: showMatch as ShowType | null
      };
    },
    enabled: !!showId,
  });

  useEffect(() => {
    if (error) {
      showToast('Error loading booking checkout details.', 'error');
    }
  }, [error, showToast]);

  const seats = data?.seats || [];
  const show = data?.show || null;

  // Handle Checkout Click
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone) {
      showToast('Please enter your name and phone number.', 'info');
      return;
    }

    setPaying(true);
    try {
      const idempotencyKey = generateUUID();

      // Create Booking Order
      const res = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId,
          seatLayoutIds,
          customerName,
          customerPhone,
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
        // Trigger simulated Mock Gateway Overlay
        setMockBookingPayload(orderData);
        setShowMockGateway(true);
      } else {
        // Trigger live Razorpay Gateway
        triggerRazorpayPayment(orderData);
      }

    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Checkout failed. Please try again.', 'error');
      setPaying(false);
    }
  };

  // Launch Razorpay Payment Window
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

  // ── MOCK SIMULATION TRIGGERS ─────────────────────────────────
  const handleSimulatePaymentSuccess = async () => {
    if (!mockBookingPayload) return;
    setPaying(true);
    
    try {
      // Hit our Webhook API directly as a mock webhook delivery
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
    
    // Release locks in DB
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

  // Calculate pricing summary
  let totalAmount = 0;
  const selectedSeatLabels: string[] = [];

  seatLayoutIds.forEach((layoutId) => {
    const seat = seats.find(s => s.seat_layout_id === layoutId);
    if (seat && seat.seat_layout) {
      selectedSeatLabels.push(`${seat.seat_layout.row_label}-${seat.seat_layout.seat_number}`);
      const category = seat.seat_layout.category;
      const price = show ? {
        normal: show.price_normal,
        premium: show.price_premium,
        recliner: show.price_recliner
      }[category] : 0;
      totalAmount += Number(price);
    }
  });

  if (loading) {
    return (
      <>
        <Header />
        <div style={{ display: 'flex', minHeight: '80vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-void)', color: '#FFFFFF' }}>
          <h3 style={{ fontFamily: 'var(--font-family-heading)', fontWeight: 700 }}>Loading checkout details...</h3>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <Header />
      <main style={{ 
        backgroundColor: 'var(--bg-void)', 
        color: '#FFFFFF', 
        minHeight: 'calc(100vh - 180px)', 
        padding: '50px 20px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow Effects */}
        <div style={{
          position: 'absolute',
          top: '15%',
          left: '10%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(150, 40, 40, 0.04) 0%, transparent 70%)',
          filter: 'blur(100px)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        <div className="container" style={{ maxWidth: '960px', position: 'relative', zIndex: 1 }}>
          
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

        </div>      </main>
      <Footer />
    </>
  );
}
