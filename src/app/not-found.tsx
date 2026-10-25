import React from 'react';
import Link from 'next/link';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';

// Rendered for notFound() calls (e.g. an unknown movie id) and for any URL
// that doesn't match a route. Next adds the noindex meta automatically.
export default function NotFound() {
  return (
    <div className="bg-void min-h-screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '160px 24px 100px',
        textAlign: 'center',
        background: 'linear-gradient(to bottom, var(--bg-void), var(--bg-primary))'
      }}>
        <div style={{ maxWidth: '520px' }}>
          <span style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '0.85rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--gold-500)'
          }}>
            Error 404
          </span>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.2rem, 6vw, 3.5rem)',
            color: 'var(--text-primary)',
            margin: '16px 0'
          }}>
            This Screen Is Dark
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '32px' }}>
            The page you&apos;re looking for doesn&apos;t exist or has moved. The show is still on — head back and pick a movie.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/" className="btn btn-primary">
              Back to Home
            </Link>
            <Link href="/movies" className="btn btn-ghost">
              Browse Movies
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
