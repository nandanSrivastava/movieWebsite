import React from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';

export const revalidate = 60;

export default async function MoviesPage() {
  let movies: Awaited<ReturnType<typeof db.getMovies>> = [];
  try {
    movies = await db.getMovies();
  } catch (err) {
    console.error('[MoviesPage] Failed to load movies from DB:', err);
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        .movies-page-header {
          padding: 160px 0 80px;
          text-align: center;
          background: linear-gradient(to bottom, var(--bg-void), var(--bg-primary));
        }
        .movies-page-title {
          font-family: var(--font-display);
          font-size: clamp(2.5rem, 6vw, 4.5rem);
          color: #fff;
          margin-bottom: 16px;
        }
        .movies-page-subtitle {
          color: var(--gold-500);
          font-family: var(--font-heading);
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }
        
        .movies-grid-section {
          padding: 0 0 120px;
          background: var(--bg-primary);
        }
        
        .movies-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 40px 32px;
          max-width: var(--max-width);
          margin: 0 auto;
          padding: 0 20px;
        }

        .premium-poster {
          text-decoration: none;
          display: block;
        }

        .poster-image-wrap {
          width: 100%;
          aspect-ratio: 2/3;
          border-radius: 8px;
          overflow: hidden;
          position: relative;
          box-shadow: 0 20px 40px rgba(0,0,0,0.5);
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .poster-image-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.8s var(--ease-out-expo);
        }

        .premium-poster:hover .poster-image-wrap {
          transform: translateY(-12px);
          box-shadow: 0 30px 60px rgba(0,0,0,0.8), 0 0 40px rgba(212, 175, 55, 0.15);
          border: 1px solid rgba(212, 175, 55, 0.3);
        }

        .premium-poster:hover .poster-image-wrap img {
          transform: scale(1.08);
        }

        .poster-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(3,4,8,0.9) 0%, transparent 60%);
          opacity: 0;
          transition: opacity 0.4s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .premium-poster:hover .poster-overlay {
          opacity: 1;
        }

        .book-now-badge {
          background: var(--crimson);
          color: white;
          padding: 10px 24px;
          border-radius: 100px;
          font-family: var(--font-heading);
          font-weight: 600;
          font-size: 0.9rem;
          letter-spacing: 0.05em;
          transform: translateY(20px);
          opacity: 0;
          transition: all 0.5s var(--ease-spring) 0.1s;
        }

        .premium-poster:hover .book-now-badge {
          transform: translateY(0);
          opacity: 1;
        }

        .poster-info {
          margin-top: 24px;
          text-align: center;
        }

        .poster-title {
          font-family: var(--font-display);
          font-size: 1.25rem;
          font-weight: 600;
          color: #fff;
          margin-bottom: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .poster-meta {
          font-family: var(--font-heading);
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .poster-cert {
          color: var(--gold-500);
          border: 1px solid var(--gold-500);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 700;
        }
      `}} />
      <div className="bg-void min-h-screen">
        <Header />
        <main>
          <section className="movies-page-header">
            <div className="container">
              <span className="movies-page-subtitle">Full Catalog</span>
              <h1 className="movies-page-title">Explore Collection</h1>
            </div>
          </section>
          
          <section className="movies-grid-section">
            <div className="movies-grid">
              {movies.map((movie) => (
                <Link key={movie.id} href={`/movies/${movie.id}`} className="premium-poster">
                  <div className="poster-image-wrap">
                    <img src={movie.poster_url} alt={movie.title} loading="lazy" />
                    <div className="poster-overlay">
                      <span className="book-now-badge">Book Now</span>
                    </div>
                  </div>
                  <div className="poster-info">
                    <h3 className="poster-title">{movie.title}</h3>
                    <div className="poster-meta">
                      <span className="poster-cert">{movie.certification}</span>
                      <span>{movie.duration_minutes} min</span>
                      <span>•</span>
                      <span>{movie.genre}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
