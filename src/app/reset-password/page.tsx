'use client';

import React, { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { useToast } from '@/features/shared/context/ToastContext';
import Header from '@/features/shared/components/Header';
import StatusMessage from '@/features/shared/components/StatusMessage';
import { isMockMode } from '@/lib/config';

// Reached from the reset email via /auth/callback?next=/reset-password, which
// has already turned the link into a (recovery) session cookie. The shared
// @supabase/ssr browser client reads that cookie, so updateUser() below acts
// on the account the link was sent to.
function ResetPasswordForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, loading } = useCineBookAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No session means the link expired, was already used, or this page was
  // opened directly — updateUser would only fail with "Auth session missing".
  if (!loading && !user && !isMockMode) {
    return (
      <StatusMessage
        tone="urgent"
        title="This reset link has expired"
        body="This password reset link is invalid or has already been used. Request a new one from the sign-in page, and open it in this same browser."
        actions={[{ href: '/login', label: 'Back to sign in', primary: true }]}
      />
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    if (isMockMode) {
      showToast('Password update mocked in dev mode.', 'success');
      router.replace('/login');
      return;
    }

    setSubmitting(true);
    try {
      const { supabase } = await import('@/lib/supabaseClient');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // The recovery session stays signed in; /login forwards by role.
      showToast('Password updated.', 'success');
      router.replace('/login');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="container" style={{ display: 'flex', justifyContent: 'center', paddingTop: 32, paddingBottom: 48 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <h1 className="display" style={{ fontSize: 'var(--fs-3xl)' }}>Set a new password</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4, marginBottom: 24 }}>
          Choose a password of at least 8 characters for your Dhrub Cineplex account.
        </p>

        {error && (
          <div className="notice notice-danger" role="alert" style={{ marginBottom: 16 }}>
            <AlertCircle aria-hidden /><div>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="reset-password" className="form-label">New password</label>
            <input id="reset-password" type="password" className="form-control" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} required minLength={8} />
          </div>
          <div className="form-group">
            <label htmlFor="reset-confirm" className="form-label">Confirm new password</label>
            <input id="reset-confirm" type="password" className="form-control" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={submitting} required minLength={8} />
          </div>
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={submitting} aria-busy={submitting || undefined}>
            {submitting ? <><span className="spinner" aria-hidden />Saving…</> : 'Save new password'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <Header />
      <Suspense fallback={
        <main className="container" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="spinner" aria-hidden />
          <span className="sr-only" role="status">Loading</span>
        </main>
      }>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
