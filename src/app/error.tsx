'use client'; // Error boundaries must be Client Components

import React, { useEffect } from 'react';
import Link from 'next/link';
import { reportError } from '@/lib/reportError';

// Route-level fallback: catches anything a page throws (e.g. a DB blip while
// rendering the movie list) and renders inside the root layout, so the site
// chrome, fonts and theme are still available.
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Errors with a digest came from a Server Component and were already
    // reported server-side (with the real stack) via onRequestError — the
    // browser only gets a redacted copy, so don't report it twice.
    if (!error.digest) {
      reportError(error);
    }
  }, [error]);

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      backgroundColor: 'var(--bg-primary)'
    }}>
      <div className="card" style={{ maxWidth: '460px', width: '100%', padding: '40px', textAlign: 'center' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: 'var(--crimson-glow)',
          color: 'var(--accent-crimson)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          fontSize: '32px',
          fontWeight: 700
        }}>
          !
        </div>
        <h1 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '1.8rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '12px'
        }}>
          Something went wrong
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '28px' }}>
          We couldn&apos;t load this page just now. Please try again in a moment.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => retry()}>
            Try Again
          </button>
          <Link href="/" className="btn btn-ghost">
            Back to Home
          </Link>
        </div>
        {error.digest && (
          <p style={{ marginTop: '24px', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Ref: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
