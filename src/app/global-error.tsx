'use client'; // Error boundaries must be Client Components

import React, { useEffect } from 'react';
import { reportError } from '@/lib/reportError';

// Last-resort fallback for errors in the root layout itself. It replaces the
// whole document, so globals.css, fonts and the theme are NOT loaded here —
// colors below are the literal values of the dark-theme tokens.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    // global-error must include html and body tags
    <html lang="en">
      <body style={{
        margin: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        backgroundColor: '#08080C',
        color: '#F8F9FA',
        fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
        textAlign: 'center'
      }}>
        <title>Something went wrong | Dhrub Cineplex</title>
        <div style={{
          maxWidth: '460px',
          width: '100%',
          padding: '40px',
          backgroundColor: '#0C0C12',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.6)',
          boxSizing: 'border-box'
        }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '24px' }}>
            Dhrub <span style={{ color: '#F06E00' }}>Cineplex</span>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 12px' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#B4B9C8', fontSize: '0.95rem', lineHeight: 1.6, margin: '0 0 28px' }}>
            The site hit an unexpected problem. Your bookings are safe — please try again.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              padding: '12px 32px',
              backgroundColor: '#F06E00',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '1rem',
              fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(240, 110, 0, 0.35)'
            }}
          >
            Try Again
          </button>
          {/* Plain <a> on purpose: a full page load is the most reliable way out of a broken root layout. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ display: 'block', marginTop: '18px', color: '#B4B9C8', fontSize: '0.9rem' }}>
            Back to Home
          </a>
          {error.digest && (
            <p style={{ marginTop: '24px', marginBottom: 0, fontSize: '0.75rem', color: '#788099', fontFamily: 'monospace' }}>
              Ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
