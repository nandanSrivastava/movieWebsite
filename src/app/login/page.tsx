'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { useToast } from '@/features/shared/context/ToastContext';
import { z } from 'zod';
import { isMockMode } from '@/lib/config';
import { createClient } from '@supabase/supabase-js';

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

export default function LoginPage() {
  return (
    <React.Suspense fallback={
      <div style={{ backgroundColor: 'var(--bg-primary)', color: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h3>Loading authentication...</h3>
      </div>
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
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Check for unauthorized access redirects
  useEffect(() => {
    if (searchParams.get('error') === 'unauthorized') {
      showToast('Access Denied: You do not have permission to view that section.', 'error');
    }
  }, [searchParams, showToast]);

  // Handle auto-redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      const redirectUrl = searchParams.get('redirect');
      if (redirectUrl && redirectUrl.startsWith('/')) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }
    if (isSignUp && (!fullName || !phone)) {
      showToast('Please provide your name and phone number to sign up.', 'error');
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
      showToast(validationResult.error.issues[0]?.message || 'Invalid input provided.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUp(email, password, fullName, phone);
        showToast('Registration successful! Welcome to Dhrub Cineplex.', 'success');
      } else {
        await signIn(email, password);
        showToast('Successfully signed in.', 'success');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Authentication failed. Please verify credentials.', 'error');
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
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Visual Ambient Glows */}
      <div style={{
        position: 'absolute',
        top: '-15%',
        right: '-10%',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(150, 40, 40, 0.08) 0%, transparent 70%)',
        filter: 'blur(60px)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        left: '-10%',
        width: '600px',
        height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(197, 168, 128, 0.06) 0%, transparent 70%)',
        filter: 'blur(80px)',
        pointerEvents: 'none'
      }} />

      {/* Main Login Card */}
      <div className="card" style={{
        maxWidth: '440px',
        width: '100%',
        padding: '40px',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-subtle)',
        position: 'relative',
        zIndex: 10
      }}>
        {/* Branding header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{
            fontSize: '2.2rem',
            fontWeight: 800,
            letterSpacing: '-0.5px',
            color: '#FFFFFF'
          }}>
            Dhrub <span style={{ color: 'var(--accent-crimson)' }}>Cineplex</span>
          </h1>
          <p style={{
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
            marginTop: '6px'
          }}>
            {isSignUp ? 'Create your tickets account' : 'Sign in to access your bookings'}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {isSignUp && (
            <>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="+91 99999 99999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-control"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">Password</label>
              {!isSignUp && (
                <button 
                  type="button"
                  onClick={async () => {
                    if (!email) {
                      showToast('Please enter your email to reset password.', 'info');
                      return;
                    }
                    if (!isMockMode) {
                      try {
                        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
                        await supabase.auth.resetPasswordForEmail(email, {
                          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`
                        });
                        showToast('Password reset link sent to your email.', 'success');
                      } catch {
                        showToast('Failed to send reset link.', 'error');
                      }
                    } else {
                      showToast('Password reset mocked in dev mode.', 'success');
                    }
                  }}
                  style={{ fontSize: '0.8rem', color: 'var(--accent-crimson)', marginBottom: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '1rem', marginBottom: '20px' }}
            disabled={submitting}
          >
            {submitting ? 'Authenticating...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '0.85rem'
        }}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            style={{
              color: 'var(--accent-crimson)',
              fontWeight: 600,
              backgroundColor: 'transparent',
              border: 'none',
              padding: '0 4px',
              cursor: 'pointer'
            }}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>

        {/* Quick Dev Tips if in mock mode */}
        {isMockMode && (
          <div style={{
            marginTop: '32px',
            padding: '12px',
            borderRadius: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed var(--border-default)',
            fontSize: '0.8rem',
            color: 'var(--text-muted)'
          }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Dev Tip:</strong> In Mock Mode, log in with <code style={{ color: 'var(--highlight-gold)' }}>admin@cinebook.com</code> or <code style={{ color: 'var(--highlight-gold)' }}>member@cinebook.com</code> to simulate roles instantly.
          </div>
        )}
      </div>
    </div>
  );
}
