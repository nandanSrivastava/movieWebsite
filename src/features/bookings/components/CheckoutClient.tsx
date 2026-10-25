'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { AlertCircle, Clock } from 'lucide-react';
import { useToast } from '@/features/shared/context/ToastContext';
import BookingSummaryCard from '@/features/bookings/components/BookingSummaryCard';
import CheckoutForm, { FieldErrors } from '@/features/bookings/components/CheckoutForm';
import MockGatewayModal from '@/features/bookings/components/MockGatewayModal';
import BookingBar from '@/features/bookings/components/BookingBar';
import { formatINR } from '@/features/shared/utils/format';
import { isMockMode } from '@/lib/config';
import { supabase as supabaseClient } from '@/lib/supabaseClient';
import styles from './CheckoutClient.module.css';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Indian mobile: 10 digits starting 6–9. Profiles may store +91 / 0 prefixes.
const toMobileDigits = (value: string) => {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

function validate(name: string, phone: string, email: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!name.trim()) errors.name = 'Enter the name for this booking.';
  const digits = toMobileDigits(phone);
  if (!digits) errors.phone = 'Enter your mobile number.';
  else if (!/^[6-9]\d{9}$/.test(digits)) errors.phone = 'Enter a 10-digit mobile number.';
  if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Check the email address, or leave it blank.';
  return errors;
}

const formatTimer = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

type PaymentIssue = { kind: 'failed' | 'closed' | 'error'; message: string };

export default function CheckoutClient({
  showId,
  seatLayoutIds,
  selectedSeatLabels,
  lineItems,
  totalAmount,
  user,
  holdExpiresAt
}: {
  showId: string;
  seatLayoutIds: string[];
  show: any;
  selectedSeatLabels: string[];
  lineItems: { label: string; count: number; price: number }[];
  totalAmount: number;
  user: any;
  holdExpiresAt: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [paying, setPaying] = useState(false);
  const [paymentIssue, setPaymentIssue] = useState<PaymentIssue | null>(null);
  const paymentFailedRef = useRef(false);

  // One key per checkout: a double click or retry returns the same booking/order
  const [idempotencyKey] = useState(generateUUID);

  // Seat hold countdown (server time; extended when the payment window opens)
  const [holdExpiry, setHoldExpiry] = useState<string | null>(holdExpiresAt);
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    holdExpiresAt ? Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - Date.now()) / 1000)) : 0
  );
  useEffect(() => {
    if (!holdExpiry) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.floor((new Date(holdExpiry).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [holdExpiry]);
  const holdExpired = !!holdExpiry && secondsLeft === 0;
  const holdUrgent = !holdExpired && secondsLeft > 0 && secondsLeft <= 120;

  // Screen readers hear the timer at a few moments, not every second
  const [timerAnnouncement, setTimerAnnouncement] = useState('');
  useEffect(() => {
    if (secondsLeft === 120) setTimerAnnouncement('2 minutes left to pay before your seats are released.');
    else if (secondsLeft === 60) setTimerAnnouncement('1 minute left to pay before your seats are released.');
    else if (holdExpired) setTimerAnnouncement('Your seat hold has expired.');
  }, [secondsLeft, holdExpired]);

  const ticketPath = (bookingId: string, accessKey?: string, extra = '') =>
    `/booking/confirmation/${bookingId}?${accessKey ? `k=${encodeURIComponent(accessKey)}` : ''}${extra}`;

  // Form Fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cash'>('online');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Simulated Modal State
  const [showMockGateway, setShowMockGateway] = useState(false);
  const [mockBookingPayload, setMockBookingPayload] = useState<any>(null);

  useEffect(() => {
    if (user) {
      setCustomerName(user.full_name || '');
      setCustomerPhone(toMobileDigits(user.phone || ''));
      setCustomerEmail(user.email || '');
    }
  }, [user]);

  // Re-check a field once the person has left it, so errors don't appear mid-typing
  useEffect(() => {
    const all = validate(customerName, customerPhone, customerEmail);
    setErrors(Object.fromEntries(Object.entries(all).filter(([k]) => touched[k])) as FieldErrors);
  }, [customerName, customerPhone, customerEmail, touched]);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(customerName, customerPhone, customerEmail);
    if (Object.keys(found).length > 0) {
      setTouched({ name: true, phone: true, email: true });
      setErrors(found);
      const first = (['name', 'phone', 'email'] as const).find(k => found[k]);
      document.getElementById(`checkout-${first}`)?.focus();
      return;
    }
    if (holdExpired) {
      showToast('Your seat hold has expired. Please choose your seats again.', 'error');
      return;
    }

    setPaying(true);
    setPaymentIssue(null);
    paymentFailedRef.current = false;
    try {

      let token = '';
      if (!isMockMode) {
        const { data } = await supabaseClient.auth.getSession();
        token = data.session?.access_token || '';
      }

      const res = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          showId,
          seatLayoutIds,
          customerName: customerName.trim(),
          customerPhone: toMobileDigits(customerPhone),
          customerEmail: customerEmail.trim(),
          idempotencyKey,
          paymentMethod
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create booking order.');
      }

      const orderData = await res.json();
      if (orderData.holdExpiresAt) setHoldExpiry(orderData.holdExpiresAt);

      if (orderData.alreadyPaid) {
        router.replace(ticketPath(orderData.bookingId, orderData.accessKey));
        return;
      }

      if (orderData.isCash) {
        showToast('Cash sale confirmed.', 'success');
        router.replace(ticketPath(orderData.bookingId, orderData.accessKey));
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
      setPaymentIssue({ kind: 'error', message: err.message || 'Checkout failed. Please try again.' });
      setPaying(false);
    }
  };

  const triggerRazorpayPayment = (order: any) => {
    if (!(window as any).Razorpay) {
      setPaymentIssue({ kind: 'error', message: 'The payment page didn’t load. Check your connection and refresh this page.' });
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
      // Close the payment window before the seat hold runs out
      timeout: order.checkoutTimeoutSeconds,
      prefill: {
        name: order.customerName,
        contact: order.customerPhone,
        ...(order.customerEmail ? { email: order.customerEmail } : {})
      },
      handler: function (response: any) {
        showToast('Payment received. Confirming your ticket…', 'success');
        router.replace(ticketPath(order.bookingId, order.accessKey, `&paymentId=${encodeURIComponent(response.razorpay_payment_id)}`));
      },
      modal: {
        ondismiss: function () {
          if (!paymentFailedRef.current) {
            setPaymentIssue({
              kind: 'closed',
              message: 'The payment window closed before payment finished. If money left your account, we’ll confirm your ticket or refund you automatically within a few minutes.',
            });
          }
          setPaying(false);
        }
      },
      theme: {
        color: '#FAA000'
      }
    };

    const rzp = new (window as any).Razorpay(options);
    // Razorpay lets the person retry inside its window; we note the failure for when it closes
    rzp.on('payment.failed', (response: any) => {
      paymentFailedRef.current = true;
      const reason = response?.error?.description;
      setPaymentIssue({
        kind: 'failed',
        message: `${reason ? `${reason} ` : ''}Try again, or use another UPI app or card. If money was deducted for a failed attempt, your bank returns it.`,
      });
    });
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
          paymentId: `pay_mock_${Math.random().toString(36).substring(2, 9)}`
        })
      });

      if (!res.ok) throw new Error('Mock webhook delivery failed');
      const data = await res.json();

      if (data.status === 'confirmed' || data.status === 'already_paid') {
        router.replace(ticketPath(mockBookingPayload.bookingId, mockBookingPayload.accessKey));
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
        body: JSON.stringify({ showId, seatLayoutIds })
      });
    } catch {}

    setPaying(false);
    setShowMockGateway(false);
    router.replace(`/booking/${showId}`);
  };

  const isCash = paymentMethod === 'cash';
  const ticketWord = seatLayoutIds.length === 1 ? 'ticket' : 'tickets';

  const timerNotice = holdExpiry && (
    <div className={`${styles.timer} ${holdUrgent ? styles.timerUrgent : ''} ${holdExpired ? styles.timerExpired : ''}`}>
      <div className="container">
        {holdExpired ? (
          <span><AlertCircle aria-hidden />Your seat hold has expired. <Link href={`/booking/${showId}`}>Choose seats again</Link></span>
        ) : (
          <span><Clock aria-hidden />Seats held for <strong className={styles.clock}>{formatTimer(secondsLeft)}</strong></span>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <p className="sr-only" aria-live="assertive">{timerAnnouncement}</p>

      <div className={styles.grid}>
        <aside className={styles.summary}>
          <BookingSummaryCard selectedSeatLabels={selectedSeatLabels} lineItems={lineItems} totalAmount={totalAmount} />
        </aside>

        <div className={styles.form}>
          {paymentIssue && (
            <div className={`notice ${paymentIssue.kind === 'closed' ? 'notice-urgent' : 'notice-danger'}`} role="alert" style={{ marginBottom: 16 }}>
              <AlertCircle aria-hidden />
              <div>
                <strong>
                  {paymentIssue.kind === 'failed' ? 'Payment didn’t go through. ' : paymentIssue.kind === 'closed' ? 'Payment not finished. ' : ''}
                </strong>
                {paymentIssue.message}
                {!holdExpired && holdExpiry && paymentIssue.kind !== 'error' && <> Your seats are still held for {formatTimer(secondsLeft)}.</>}
              </div>
            </div>
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
            errors={errors}
            onFieldBlur={(field) => setTouched(t => ({ ...t, [field]: true }))}
            paying={paying || holdExpired}
            handleCheckoutSubmit={handleCheckoutSubmit}
          />
        </div>
      </div>

      <BookingBar
        label="Payment"
        notice={timerNotice}
        summary={
          <>
            <p className={styles.barTitle}>{seatLayoutIds.length} {ticketWord}</p>
            <p className={styles.barMeta}>{selectedSeatLabels.join(', ')}</p>
          </>
        }
        total={
          <div>
            <span className={styles.totalLabel}>Total</span>
            <span className={styles.totalAmount}>{formatINR(totalAmount)}</span>
          </div>
        }
        action={
          <button
            type="submit"
            form="checkout-form"
            className="btn btn-primary btn-lg"
            disabled={paying || holdExpired}
            aria-busy={paying || undefined}
          >
            {paying ? <><span className="spinner" aria-hidden />Opening payment…</>
              : holdExpired ? 'Seat hold expired'
              : isCash ? `Confirm cash sale · ${formatINR(totalAmount)}`
              : `Pay ${formatINR(totalAmount)}`}
          </button>
        }
      />

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
