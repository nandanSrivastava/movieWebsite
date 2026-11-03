'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Clock } from 'lucide-react';
import { useToast } from '@/features/shared/context/ToastContext';
import BookingSummaryCard from '@/features/bookings/components/BookingSummaryCard';
import CheckoutForm, { FieldErrors } from '@/features/bookings/components/CheckoutForm';
import MockGatewayModal from '@/features/bookings/components/MockGatewayModal';
import BookingBar from '@/features/bookings/components/BookingBar';
import { formatINR } from '@/features/shared/utils/format';
import { authHeaders } from '@/lib/authHeaders';
import { toMobileDigits, validateContact } from '@/lib/contactRules';
import styles from './CheckoutClient.module.css';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const formatTimer = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const NO_CONNECTION = 'We couldn’t reach the server. Check your connection and try again.';
// fetch() rejects with a TypeError only when the request never got an answer
const friendlyError = (err: any, fallback: string) =>
  err instanceof TypeError ? NO_CONNECTION : err?.message || fallback;

type PaymentIssue = { kind: 'failed' | 'closed' | 'error'; message: string };
type EarlierPayment = { bookingId: string; accessKey?: string };

// After the payment window closes, or the customer comes back: money may already
// be on its way, so keep asking for a while and go to the ticket as soon as it lands.
const WATCH_FIRST_CHECK_MS = 1_000;
const WATCH_EVERY_MS = 4_000;
const WATCH_FOR_MS = 90_000;

const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const RAZORPAY_LOAD_TIMEOUT_MS = 15_000;
let razorpayLoading: Promise<boolean> | null = null;

/** Loads Razorpay's script, and on a dropped connection tries again the next time Pay is pressed. */
function loadRazorpay(): Promise<boolean> {
  if ((window as any).Razorpay) return Promise.resolve(true);
  razorpayLoading ??= new Promise<boolean>((resolve) => {
    const script = document.createElement('script');
    const finish = (loaded: boolean) => {
      clearTimeout(timer);
      if (!loaded) {
        razorpayLoading = null;
        script.remove();
      }
      resolve(loaded);
    };
    const timer = setTimeout(() => finish(!!(window as any).Razorpay), RAZORPAY_LOAD_TIMEOUT_MS);
    script.src = RAZORPAY_SRC;
    script.async = true;
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });
  return razorpayLoading;
}

/**
 * Counts down from the seconds the server reported. Only differences between two
 * readings of this device's clock are used, so a phone whose clock is wrong still
 * shows the right time left.
 */
function useHoldCountdown(initialSeconds: number) {
  const [deadline, setDeadline] = useState(() => Date.now() + initialSeconds * 1000);
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const restart = useCallback((seconds: number) => {
    setDeadline(Date.now() + seconds * 1000);
    setSecondsLeft(seconds);
  }, []);
  useEffect(() => {
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return { secondsLeft, restart };
}

export default function CheckoutClient({
  showId,
  seatLayoutIds,
  selectedSeatLabels,
  lineItems,
  totalAmount,
  user,
  holdSecondsLeft,
  earlierDetails,
  resume
}: {
  showId: string;
  seatLayoutIds: string[];
  show: any;
  selectedSeatLabels: string[];
  lineItems: { label: string; count: number; price: number }[];
  totalAmount: number;
  user: any;
  holdSecondsLeft: number;
  earlierDetails: { name: string; phone: string; email: string } | null;
  resume: EarlierPayment | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [paying, setPaying] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [paymentIssue, setPaymentIssue] = useState<PaymentIssue | null>(null);
  const paymentFailedRef = useRef(false);

  // One key per checkout: a double click or retry returns the same booking/order
  const [idempotencyKey] = useState(generateUUID);

  // Seat hold countdown (server's figure; extended when the payment window opens)
  const { secondsLeft, restart: restartCountdown } = useHoldCountdown(holdSecondsLeft);
  useEffect(() => { restartCountdown(holdSecondsLeft); }, [holdSecondsLeft, restartCountdown]);
  const holdExpired = secondsLeft === 0;
  const holdUrgent = !holdExpired && secondsLeft <= 120;

  // A cached page can bring back an old figure, and another tab can extend the
  // hold, so ask again on arrival and whenever the customer returns to this tab.
  const seatCount = seatLayoutIds.length;
  useEffect(() => {
    const seatSet = new Set(seatLayoutIds);
    const resync = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/api/seats/holds?showId=${showId}`, { headers: await authHeaders() });
        if (!res.ok) return;
        const data: { seatLayoutIds: string[]; holdSecondsLeft: number } = await res.json();
        const stillHeld = data.seatLayoutIds.filter(id => seatSet.has(id)).length === seatCount;
        restartCountdown(stillHeld ? data.holdSecondsLeft : 0);
      } catch {
        // Offline: keep counting down from what we know
      }
    };
    resync();
    document.addEventListener('visibilitychange', resync);
    return () => document.removeEventListener('visibilitychange', resync);
    // seatLayoutIds is a new array on each render but the same seats: seatCount and showId identify it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId, seatCount, restartCountdown]);

  // The hold has ended. The server decides what that means: ticket, refund, or pick seats again.
  useEffect(() => {
    if (holdExpired && !paying) router.refresh();
  }, [holdExpired, paying, router]);

  // Screen readers hear the timer at a few moments, not every second
  const [timerAnnouncement, setTimerAnnouncement] = useState('');
  useEffect(() => {
    if (secondsLeft === 120) setTimerAnnouncement('2 minutes left to pay before your seats are released.');
    else if (secondsLeft === 60) setTimerAnnouncement('1 minute left to pay before your seats are released.');
    else if (holdExpired) setTimerAnnouncement('Your seat hold has expired.');
  }, [secondsLeft, holdExpired]);

  const ticketPath = useCallback((bookingId: string, accessKey?: string, extra = '') =>
    `/booking/confirmation/${bookingId}?${accessKey ? `k=${encodeURIComponent(accessKey)}` : ''}${extra}`, []);

  // Asks Razorpay about an earlier attempt, and moves to the ticket if it landed
  const [watching, setWatching] = useState<EarlierPayment | null>(resume);
  const [watchFinished, setWatchFinished] = useState(false);
  useEffect(() => {
    if (!watching || paying) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();
    const check = async () => {
      try {
        const res = await fetch('/api/bookings/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: watching.bookingId }),
        });
        const data = res.ok ? await res.json() : null;
        if (stopped) return;
        if (data?.status === 'confirmed' || data?.status === 'refunded') {
          router.replace(ticketPath(watching.bookingId, watching.accessKey));
          return;
        }
      } catch {
        // Offline: the next try, or the reconcile job, picks it up
      }
      if (stopped) return;
      if (Date.now() - startedAt < WATCH_FOR_MS) timer = setTimeout(check, WATCH_EVERY_MS);
      else setWatchFinished(true);
    };
    timer = setTimeout(check, WATCH_FIRST_CHECK_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [watching, paying, router, ticketPath]);

  useEffect(() => { loadRazorpay(); }, []);

  // Form Fields. Staff sell to someone else, so their own details aren't filled in.
  const isStaff = !!user && ['admin', 'member'].includes(user.role);
  const fromAccount = user && !isStaff ? user : null;
  const [customerName, setCustomerName] = useState<string>(earlierDetails?.name ?? fromAccount?.full_name ?? '');
  const [customerPhone, setCustomerPhone] = useState<string>(earlierDetails?.phone ?? toMobileDigits(fromAccount?.phone));
  const [customerEmail, setCustomerEmail] = useState<string>(earlierDetails?.email ?? fromAccount?.email ?? '');
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cash'>('online');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Simulated Modal State
  const [showMockGateway, setShowMockGateway] = useState(false);
  const [mockBookingPayload, setMockBookingPayload] = useState<any>(null);

  // Re-check a field once the person has left it, so errors don't appear mid-typing
  useEffect(() => {
    const all = validateContact(customerName, customerPhone, customerEmail);
    setErrors(Object.fromEntries(Object.entries(all).filter(([k]) => touched[k])) as FieldErrors);
  }, [customerName, customerPhone, customerEmail, touched]);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateContact(customerName, customerPhone, customerEmail);
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
      const res = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
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
        if (errData.reason === 'hold_expired') {
          restartCountdown(0);
          setPaying(false);
          return;
        }
        throw new Error(errData.error || 'Could not start the payment. Please try again.');
      }

      const orderData = await res.json();
      if (typeof orderData.holdSecondsLeft === 'number') restartCountdown(orderData.holdSecondsLeft);

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
        await triggerRazorpayPayment(orderData);
      }

    } catch (err: any) {
      console.error(err);
      setPaymentIssue({ kind: 'error', message: friendlyError(err, 'Checkout failed. Please try again.') });
      setPaying(false);
    }
  };

  const triggerRazorpayPayment = async (order: any) => {
    if (!(await loadRazorpay())) {
      setPaymentIssue({ kind: 'error', message: 'The payment page didn’t load. Check your connection and press Pay again.' });
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
              message: 'The payment window closed before payment finished. If money left your account, don’t pay again: we’ll confirm your ticket or refund you automatically within a few minutes.',
            });
          }
          // Money may be on its way (UPI approvals arrive late, windows get closed by accident)
          setWatchFinished(false);
          setWatching({ bookingId: order.bookingId, accessKey: order.accessKey });
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

  // The customer changed their mind: the seats go back on sale right away, and a
  // payment that still lands on this booking is refunded.
  const handleRelease = async () => {
    setReleasing(true);
    try {
      const res = await fetch('/api/seats/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ showId, seatLayoutIds })
      });
      if (!res.ok) throw new Error('Could not release your seats right now. They’ll be released when the timer ends.');
      showToast('Your seats have been released.', 'success');
      router.replace(`/booking/${showId}`);
    } catch (err: any) {
      showToast(friendlyError(err, 'Could not release your seats right now.'), 'error');
      setReleasing(false);
    }
  };

  const isCash = paymentMethod === 'cash';
  const ticketWord = seatLayoutIds.length === 1 ? 'ticket' : 'tickets';

  const timerNotice = (
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
      <p className="sr-only" aria-live="assertive">{timerAnnouncement}</p>

      <div className={styles.grid}>
        <aside className={styles.summary}>
          <BookingSummaryCard selectedSeatLabels={selectedSeatLabels} lineItems={lineItems} totalAmount={totalAmount} />
        </aside>

        <div className={styles.form}>
          {resume && !paymentIssue && (
            <div className="notice notice-accent" role="status" style={{ marginBottom: 16 }}>
              <Clock aria-hidden />
              <div>
                {watchFinished ? (
                  <><strong>We haven’t seen a payment for these seats yet. </strong>If you didn’t finish paying, you can pay below. If money did leave your account, we’ll confirm your ticket or refund you automatically.</>
                ) : (
                  <><strong>You started paying for these seats earlier. </strong>We’re checking whether it went through, and this page moves to your ticket as soon as it does. If money left your account, don’t pay again.</>
                )}
              </div>
            </div>
          )}

          {paymentIssue && (
            <div className={`notice ${paymentIssue.kind === 'closed' ? 'notice-urgent' : 'notice-danger'}`} role="alert" style={{ marginBottom: 16 }}>
              <AlertCircle aria-hidden />
              <div>
                <strong>
                  {paymentIssue.kind === 'failed' ? 'Payment didn’t go through. ' : paymentIssue.kind === 'closed' ? 'Payment not finished. ' : ''}
                </strong>
                {paymentIssue.message}
                {!holdExpired && paymentIssue.kind !== 'error' && <> Your seats are still held for {formatTimer(secondsLeft)}.</>}
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

          <button
            type="button"
            className={`btn btn-quiet ${styles.release}`}
            onClick={handleRelease}
            disabled={paying || releasing || holdExpired}
            aria-busy={releasing || undefined}
          >
            {releasing ? 'Releasing your seats…' : 'Cancel and release my seats'}
          </button>
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
