import React from 'react';
import Link from 'next/link';
import { AlertCircle, Smartphone, CreditCard, Landmark, ShieldCheck, Banknote } from 'lucide-react';
import styles from './CheckoutForm.module.css';

export type FieldErrors = Partial<Record<'name' | 'phone' | 'email', string>>;

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
  errors: FieldErrors;
  onFieldBlur: (field: keyof FieldErrors) => void;
  paying: boolean;
  handleCheckoutSubmit: (e: React.FormEvent) => void;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <span id={id} className="form-error"><AlertCircle aria-hidden width={16} height={16} />{message}</span>;
}

export default function CheckoutForm({
  user, paymentMethod, setPaymentMethod, customerName, setCustomerName,
  customerPhone, setCustomerPhone, customerEmail, setCustomerEmail,
  errors, onFieldBlur, paying, handleCheckoutSubmit
}: CheckoutFormProps) {
  const isStaff = user && ['admin', 'member'].includes(user.role);
  const describe = (field: keyof FieldErrors, hint?: string) =>
    [errors[field] ? `checkout-${field}-error` : null, hint].filter(Boolean).join(' ') || undefined;

  return (
    <form id="checkout-form" onSubmit={handleCheckoutSubmit} noValidate className={styles.form}>
      <section className={styles.section} aria-labelledby="contact-heading">
        <h2 id="contact-heading" className={styles.heading}>Your details</h2>
        <p className={styles.sub}>Used for your ticket.</p>

        <div className={styles.field}>
          <label htmlFor="checkout-name" className="form-label">Name</label>
          <input
            id="checkout-name"
            type="text"
            className="form-control"
            autoComplete="name"
            autoCapitalize="words"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            onBlur={() => onFieldBlur('name')}
            aria-invalid={!!errors.name || undefined}
            aria-describedby={describe('name')}
            disabled={paying}
            required
          />
          <FieldError id="checkout-name-error" message={errors.name} />
        </div>

        <div className={styles.field}>
          <label htmlFor="checkout-phone" className="form-label">Mobile number</label>
          <div className={styles.phone}>
            <span className={styles.prefix} aria-hidden>+91</span>
            <input
              id="checkout-phone"
              type="tel"
              className={`form-control ${styles.phoneInput}`}
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={14}
              placeholder="98765 43210"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value.replace(/[^\d\s]/g, ''))}
              onBlur={() => onFieldBlur('phone')}
              aria-invalid={!!errors.phone || undefined}
              aria-describedby={describe('phone', 'checkout-phone-hint')}
              disabled={paying}
              required
            />
          </div>
          <FieldError id="checkout-phone-error" message={errors.phone} />
          <span id="checkout-phone-hint" className="form-hint">Lost your ticket? You can find it again with this number.</span>
        </div>

        <div className={styles.field}>
          <label htmlFor="checkout-email" className="form-label">
            Email <span className={styles.optional}>(optional)</span>
          </label>
          <input
            id="checkout-email"
            type="email"
            className="form-control"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="name@example.com"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            onBlur={() => onFieldBlur('email')}
            aria-invalid={!!errors.email || undefined}
            aria-describedby={describe('email', 'checkout-email-hint')}
            disabled={paying}
          />
          <FieldError id="checkout-email-error" message={errors.email} />
          <span id="checkout-email-hint" className="form-hint">
            Add it to get the ticket by email. Without it, use <Link href="/booking/lookup" className={styles.link}>Find my ticket</Link> or show your number at the counter.
          </span>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="payment-heading">
        <h2 id="payment-heading" className={styles.heading}>Payment</h2>

        {isStaff && (
          <div className={styles.field}>
            <label htmlFor="checkout-method" className="form-label">Payment type (staff only)</label>
            <select
              id="checkout-method"
              className="form-control"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'online' | 'cash')}
              disabled={paying}
            >
              <option value="online">Online: UPI or card (Razorpay)</option>
              <option value="cash">Cash at the counter (confirmed straight away)</option>
            </select>
          </div>
        )}

        {paymentMethod === 'cash' ? (
          <div className={styles.methods}>
            <Banknote aria-hidden />
            <p>Take the cash first. The ticket is confirmed as soon as you press the button.</p>
          </div>
        ) : (
          <div className={styles.methods}>
            <ul className={styles.methodList} aria-label="Ways to pay">
              <li><Smartphone aria-hidden />UPI</li>
              <li><CreditCard aria-hidden />Debit or credit card</li>
              <li><Landmark aria-hidden />Net banking</li>
            </ul>
            <p className={styles.secure}><ShieldCheck aria-hidden />You&apos;ll pay on Razorpay&apos;s secure page, then come straight back to your ticket.</p>
          </div>
        )}
      </section>
    </form>
  );
}
