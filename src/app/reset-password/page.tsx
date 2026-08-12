'use client';

import React, { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { useToast } from '@/features/shared/context/ToastContext';

function ResetPasswordForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }
    if (password !== confirm) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { supabase } = await import('@/lib/supabaseClient');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showToast('Password updated. You can now sign in.', 'success');
      router.replace('/login');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to update password.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div className="card" style={{ maxWidth: '420px', width: '100%', padding: '40px' }}>
        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '8px', color: '#FFFFFF' }}>
          Set a New Password
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '28px' }}>
          Choose a strong password (at least 8 characters) for your Dhrub Cineplex account.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
              minLength={8}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={submitting}
              required
              minLength={8}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '14px' }} disabled={submitting}>
            {submitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ backgroundColor: 'var(--bg-primary)', color: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h3>Loading...</h3>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
