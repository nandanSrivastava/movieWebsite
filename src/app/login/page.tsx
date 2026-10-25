'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { useToast } from '@/features/shared/context/ToastContext';
import Header from '@/features/shared/components/Header';
import { z } from 'zod';
import { isMockMode } from '@/lib/config';
import { supabase } from '@/lib/supabaseClient';
import { safeRedirectPath } from '@/features/auth/utils/safeRedirect';
import styles from './page.module.css';

// Messages for the ?error= codes that /auth/callback and the proxy redirect with.
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Access Denied: You do not have permission to view that section.',
  link_expired: 'That email link is invalid or has expired. Please request a new one.',
  missing_code: 'That email link is invalid or has expired. Please request a new one.',
  auth_callback_failed: "We couldn't sign you in from that link. Open it in the same browser you requested it from, or request a new one.",
};

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email format").max(255, "Email is too long"),
  password: z.string().min(1, "Please fill in all required fields.").max(255, "Password is too long")
    .refine(val => !/[<>]/.test(val), { message: "Invalid characters in password" }),
});

const signUpSchema = loginSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters long").max(255, "Password is too long")
    .refine(val => !/[<>]/.test(val), { message: "Invalid characters in password" }),
  fullName: z.string().trim().min(1, "Please provide your name").max(100, "Name is too long")
    .refine(val => !/[<>]/.test(val), { message: "Invalid characters in name" }),
  phone: z.string().trim().min(1, "Please provide your phone number").max(20, "Phone number is too long"),
});

type Notice = { tone: 'danger' | 'success'; text: string } | null;

export default function LoginPage() {
  return (
    <React.Suspense fallback={
      <main className="container" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner" aria-hidden />
        <span className="sr-only" role="status">Loading sign in</span>
      </main>
    }>
      <LoginContent />
    </React.Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, signIn, signUp, loading } = useCineBookAuth();
  const { showToast } = useToast();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // Surface unauthorized-access and failed email-link redirects
  useEffect(() => {
    const message = LOGIN_ERROR_MESSAGES[searchParams.get('error') || ''];
    if (message) setNotice({ tone: 'danger', text: message });
  }, [searchParams]);

  // Handle auto-redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      // Same-origin paths only — never follow '//evil.com', '/\evil.com' or absolute URLs.
      const redirectUrl = safeRedirectPath(searchParams.get('redirect'), window.location.origin, '');
      if (redirectUrl) {
        router.replace(redirectUrl);
        return;
      }

      if (user.role === 'admin') {
        router.replace('/admin/dashboard');
      } else if (user.role === 'member') {
        router.replace('/counter');
      } else {
        router.replace('/');
      }
    }
  }, [user, loading, router, searchParams]);

  const switchMode = (signUpMode: boolean) => {
    setIsSignUp(signUpMode);
    setNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    if (!email.trim() || !password.trim()) {
      setNotice({ tone: 'danger', text: 'Please fill in all required fields.' });
      return;
    }
    if (isSignUp && (!fullName || !phone)) {
      setNotice({ tone: 'danger', text: 'Please provide your name and phone number to sign up.' });
      return;
    }

    // Advanced Zod validation against attacks
    let validationResult;
    if (isSignUp) {
      validationResult = signUpSchema.safeParse({ email, password, fullName, phone });
    } else {
      validationResult = loginSchema.safeParse({ email, password });
    }

    if (!validationResult.success) {
      setNotice({ tone: 'danger', text: validationResult.error.issues[0]?.message || 'Invalid input provided.' });
      return;
    }

    setSubmitting(true);
    try {
      if (isSignUp) {
        const { needsEmailConfirmation } = await signUp(email, password, fullName, phone);
        if (needsEmailConfirmation) {
          // No session yet — Supabase emailed a confirmation link (→ /auth/callback).
          setNotice({ tone: 'success', text: 'Almost there! Check your email for a link to confirm your account.' });
          setIsSignUp(false);
          setPassword('');
        } else {
          showToast('Registration successful! Welcome to Dhrub Cineplex.', 'success');
        }
      } else {
        await signIn(email, password);
        showToast('Successfully signed in.', 'success');
      }
    } catch (err: any) {
      console.error(err);
      setNotice({ tone: 'danger', text: err.message || 'Authentication failed. Please verify credentials.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setNotice({ tone: 'danger', text: 'Enter your email above, then press "Forgot password?" again.' });
      document.getElementById('login-email')?.focus();
      return;
    }
    if (!loginSchema.shape.email.safeParse(email).success) {
      setNotice({ tone: 'danger', text: 'Please enter a valid email address.' });
      return;
    }
    if (!isMockMode) {
      try {
        // Must be the shared @supabase/ssr browser client: it uses the PKCE
        // flow and keeps the code verifier in a cookie, so the emailed link
        // lands on /auth/callback with ?code= that the server can exchange.
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`
        });
        if (error) throw error;
        setNotice({ tone: 'success', text: 'If an account exists for that email, a reset link is on its way.' });
      } catch (err: any) {
        console.error(err);
        setNotice({
          tone: 'danger',
          text: err?.status === 429
            ? 'Too many reset requests. Please wait a minute and try again.'
            : 'Failed to send reset link. Please try again.',
        });
      }
    } else {
      setNotice({ tone: 'success', text: 'Password reset mocked in dev mode.' });
    }
  };

  return (
    <>
      <Header />
      <main className={`container ${styles.page}`}>
        <div className={styles.card}>
          <h1 className={`display ${styles.title}`}>{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
          <p className={styles.sub}>
            {isSignUp ? 'Keep all your tickets in one place.' : 'Sign in to see your tickets.'}
          </p>

          <div className={styles.tabs} role="group" aria-label="Account">
            <button type="button" aria-pressed={!isSignUp} onClick={() => switchMode(false)}>Sign in</button>
            <button type="button" aria-pressed={isSignUp} onClick={() => switchMode(true)}>Create account</button>
          </div>

          {notice && (
            <div className={`notice ${notice.tone === 'danger' ? 'notice-danger' : 'notice-success'}`} role={notice.tone === 'danger' ? 'alert' : 'status'} style={{ marginBottom: 16 }}>
              {notice.tone === 'danger' ? <AlertCircle aria-hidden /> : <CheckCircle2 aria-hidden />}
              <div>{notice.text}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {isSignUp && (
              <>
                <div className="form-group">
                  <label htmlFor="login-name" className="form-label">Full name</label>
                  <input id="login-name" type="text" className="form-control" autoComplete="name"
                    value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={submitting} required />
                </div>
                <div className="form-group">
                  <label htmlFor="login-phone" className="form-label">Mobile number</label>
                  <input id="login-phone" type="tel" inputMode="tel" className="form-control" autoComplete="tel"
                    placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={submitting} required />
                </div>
              </>
            )}

            <div className="form-group">
              <label htmlFor="login-email" className="form-label">Email</label>
              <input id="login-email" type="email" inputMode="email" className="form-control" autoComplete="email"
                autoCapitalize="none" spellCheck={false} placeholder="name@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} required />
            </div>

            <div className="form-group">
              <div className={styles.labelRow}>
                <label htmlFor="login-password" className="form-label">Password</label>
                {!isSignUp && (
                  <button type="button" className={styles.textButton} onClick={handleForgotPassword}>Forgot password?</button>
                )}
              </div>
              <div className={styles.passwordWrap}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  aria-describedby={isSignUp ? 'login-password-hint' : undefined}
                  required
                />
                <button type="button" className={styles.reveal} onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </button>
              </div>
              {isSignUp && <span id="login-password-hint" className="form-hint">At least 8 characters.</span>}
            </div>

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={submitting} aria-busy={submitting || undefined}>
              {submitting ? <><span className="spinner" aria-hidden />{isSignUp ? 'Creating account…' : 'Signing in…'}</> : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className={styles.guest}>
            No account needed to book. <Link href="/movies">Book as a guest</Link>
          </p>

          {/* Quick Dev Tips if in mock mode */}
          {isMockMode && (
            <div className={styles.devTip}>
              <strong>Dev Tip:</strong> In Mock Mode, log in with <code>admin@cinebook.com</code> or <code>member@cinebook.com</code> to simulate roles instantly.
            </div>
          )}
        </div>
      </main>
    </>
  );
}
