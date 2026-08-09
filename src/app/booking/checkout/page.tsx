'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { useToast } from '@/features/shared/context/ToastContext';
import { ShowType, SeatStatusType } from '@/lib/db';

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

  const [show, setShow] = useState<ShowType | null>(null);
  const [seats, setSeats] = useState<SeatStatusType[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Load ticket show and seat definitions
  useEffect(() => {
    if (!showId) return;
    
    const loadDetails = async () => {
      try {
        const res = await fetch(`/api/seats/status?showId=${showId}`);
        if (!res.ok) throw new Error('Failed to load show seats details');
        const data = await res.json();
        
        // Fetch show details
        const allShowsRes = await fetch('/api/shows');
        if (allShowsRes.ok) {
          const showsData = await allShowsRes.json();
          const match = showsData.shows?.find((s: any) => s.id === showId);
          if (match) setShow(match);
        }
        
        setSeats(data.seats);
      } catch (err) {
        console.error(err);
        showToast('Error loading booking checkout details.', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [showId, showToast]);

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
        router.replace(`/booking/confirmation/${order.bookingId}`);
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
          
          <h2 style={{ 
            fontSize: '2.2rem', 
            fontWeight: 800, 
            marginBottom: '36px', 
            fontFamily: 'var(--font-family-heading)',
            color: '#FFFFFF',
            letterSpacing: '-1px'
          }}>
            Review & Finalize Order
          </h2>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
            gap: '36px',
            alignItems: 'start'
          }}>
            
            {/* Left Column: Glass Ticket Summary Card */}
            {show && (
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
                    <strong style={{ color: 'var(--highlight-gold)' }}>{show.screen?.name}</strong>
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
                    <strong>{seatLayoutIds.length}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Right Column: Contact info & Payment Form */}
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

          </div>

          {/* ── MOCK GATEWAY SIMULATED MODAL OVERLAY ──────────────── */}
          {showMockGateway && (
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
          )}

        </div>
      </main>
      <Footer />
    </>
  );
}
