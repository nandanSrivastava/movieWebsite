'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, MailCheck } from 'lucide-react';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import styles from './page.module.css';

export default function BookingLookupPage() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Enter your full 10-digit mobile number.');
      document.getElementById('lookup-phone')?.focus();
      return;
    }

    setError(null);
    setLoading(true);
    setSentMessage(null);
    try {
      const res = await fetch('/api/bookings/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      setSentMessage(data.message);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Couldn’t look up bookings right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 32, maxWidth: 640 }}>
        <h1 className="display" style={{ fontSize: 'clamp(2.25rem, 7vw, 3rem)' }}>Find my ticket</h1>
        <p className={styles.lead}>
          Enter the mobile number you booked with. We&apos;ll email your tickets to the address used for the booking.
        </p>

        <form onSubmit={handleLookup} className={styles.form} noValidate>
          <label htmlFor="lookup-phone" className="form-label">Mobile number</label>
          <div className={styles.row}>
            <div className={styles.phone}>
              <span className={styles.prefix} aria-hidden>+91</span>
              <input
                id="lookup-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                className={`form-control ${styles.phoneInput}`}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+]/g, ''))}
                disabled={loading}
                aria-invalid={!!error || undefined}
                aria-describedby={error ? 'lookup-error' : undefined}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} aria-busy={loading || undefined}>
              {loading ? <><span className="spinner" aria-hidden />Sending…</> : 'Email my tickets'}
            </button>
          </div>
          {error && <p id="lookup-error" className="form-error" role="alert"><AlertCircle aria-hidden width={16} height={16} />{error}</p>}
        </form>

        {sentMessage && (
          <div className="notice notice-success" role="status" style={{ marginTop: 20 }}>
            <MailCheck aria-hidden />
            <div><strong>Check your email.</strong> {sentMessage}</div>
          </div>
        )}

        <section className={styles.help} aria-labelledby="help-heading">
          <h2 id="help-heading" className={styles.helpTitle}>Good to know</h2>
          <ul>
            <li>Use the same phone number you entered during checkout.</li>
            <li>For your privacy, tickets are only ever sent to the email used at booking.</li>
            <li>Booked while signed in? Your tickets are also under <Link href="/account/bookings">My tickets</Link>.</li>
            <li>No email on file? Show your phone number at the counter and staff will find your booking.</li>
          </ul>
        </section>
      </main>
      <Footer />
    </>
  );
}
