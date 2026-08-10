'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function HeroCarousel({ movies }: { movies: any[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (movies.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % movies.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [movies.length]);

  if (!movies.length) return null;

  return (
    <section className="premium-hero">
      <div className="ambient-orb orb-crimson" />
      <div className="ambient-orb orb-gold" />
      
      {movies.map((hero, index) => {
        const isActive = index === currentIndex;
        return (
          <div
            key={`bg-${hero.id}`}
              style={{
              position: 'absolute',
              inset: 0,
              opacity: isActive ? 1 : 0,
              visibility: isActive ? 'visible' : 'hidden',
              transition: 'opacity 1.2s var(--ease-smooth)',
              zIndex: 0
            }}
          >
            <div className="premium-hero-bg">
              <img src={hero.poster_url} alt={hero.title} />
            </div>
            <div className="premium-vignette" />
            <div className="premium-gradient" />
          </div>
        );
      })}

      <div style={{ position: 'relative', zIndex: 2, perspective: '1200px', width: '100%', display: 'flex', justifyContent: 'center' }}>
        {movies.map((hero, index) => {
          const isActive = index === currentIndex;
          return (
            <div
              key={`content-${hero.id}`}
              className="hero-content-wrapper"
              style={{
                position: isActive ? 'relative' : 'absolute',
                top: 0,
                opacity: isActive ? 1 : 0,
                transform: isActive ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(20px)',
                transformOrigin: 'center center',
                transition: 'opacity 0.8s var(--ease-out-expo), transform 0.8s var(--ease-snappy)',
                pointerEvents: isActive ? 'auto' : 'none'
              }}
            >
              <div className="hero-badge">
                <div className="hero-badge-dot" />
                Premiere Screenings
              </div>

              <h1 className="premium-title">
                {hero.title}
              </h1>

              <div className="premium-meta">
                <span style={{ color: 'var(--gold-500)' }}>{hero.certification}</span>
                <div className="meta-dot" />
                <span>{hero.genre}</span>
                <div className="meta-dot" />
                <span>{hero.duration_minutes} min</span>
                <div className="meta-dot" />
                <span>{hero.language}</span>
              </div>

              <p className="premium-synopsis">
                {hero.synopsis}
              </p>

              <div className="premium-actions">
                <Link href={`/movies/${hero.id}`} className="btn-premium btn-book">
                  Get Tickets
                </Link>
                <Link href={`/movies/${hero.id}`} className="btn-premium btn-trailer">
                  Watch Trailer
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {movies.length > 1 && (
        <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: '8px' }}>
          {movies.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              style={{
                width: '48px',
                height: '48px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0
              }}
              aria-label={`Go to slide ${i + 1}`}
            >
              <div
                style={{
                  width: i === currentIndex ? '32px' : '10px',
                  height: '8px',
                  borderRadius: '4px',
                  background: i === currentIndex ? 'var(--gold-500)' : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.5s var(--ease-spring)'
                }}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
