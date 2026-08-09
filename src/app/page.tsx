import React from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import HeroCarousel from '@/features/movies/components/HeroCarousel';
import MovieCarousel from '@/features/movies/components/MovieCarousel';

export const revalidate = 60;

export default async function Home() {
  let movies: Awaited<ReturnType<typeof db.getMovies>> = [];
  try {
    movies = await db.getMovies();
  } catch (err) {
    console.error('[Home] Failed to load movies from DB:', err);
  }
  const featuredMovies = movies.filter(m => m.is_featured);
  const heroMovies = featuredMovies.length > 0 ? featuredMovies : [movies[0]].filter(Boolean);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        /* Custom Styles for Premium Home Page */
        .premium-hero {
          position: relative;
          height: 100svh;
          min-height: 800px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          margin-top: calc(-1 * var(--header-height));
        }

        .premium-hero-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
        }

        .premium-hero-bg img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 30%;
          filter: brightness(0.65) contrast(1.1) saturate(1.2);
          transform: scale(1.05);
          animation: cinematicPan 20s ease-in-out infinite alternate;
        }

        @keyframes cinematicPan {
          from { transform: scale(1.05) translate(0, 0); }
          to { transform: scale(1.1) translate(-2%, 2%); }
        }

        .premium-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, transparent 30%, rgba(3, 4, 8, 0.8) 100%);
          z-index: 1;
        }

        .premium-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            rgba(3, 4, 8, 0.9) 0%,
            rgba(3, 4, 8, 0.2) 20%,
            transparent 50%,
            rgba(3, 4, 8, 0.9) 80%,
            var(--bg-void) 100%
          );
          z-index: 1;
        }

        .hero-content-wrapper {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: var(--max-width);
          padding: 0 5vw;
          margin-top: 15vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 8px 24px;
          background: rgba(212, 175, 55, 0.1);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 100px;
          backdrop-filter: blur(10px);
          font-family: var(--font-heading);
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--gold-400);
          margin-bottom: 32px;
          animation: float 6s ease-in-out infinite;
        }

        .hero-badge-dot {
          width: 6px;
          height: 6px;
          background-color: var(--crimson);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--crimson);
          animation: pulseCrimson 2s infinite;
        }

        @keyframes pulseCrimson {
          0% { box-shadow: 0 0 0 0 rgba(139, 30, 40, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(139, 30, 40, 0); }
          100% { box-shadow: 0 0 0 0 rgba(139, 30, 40, 0); }
        }

        .premium-title {
          font-family: var(--font-display);
          font-size: clamp(3.5rem, 8vw, 7.5rem);
          font-weight: 700;
          line-height: 1.05;
          color: var(--text-primary);
          text-shadow: 0 10px 30px rgba(0,0,0,0.8);
          margin-bottom: 24px;
          letter-spacing: -0.01em;
          background: linear-gradient(to bottom, #FFFFFF 0%, #D1C4A5 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .premium-meta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          font-family: var(--font-heading);
          font-size: 1rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.8);
          margin-bottom: 32px;
        }

        .meta-dot {
          width: 4px;
          height: 4px;
          background: var(--gold-500);
          border-radius: 50%;
          opacity: 0.5;
        }

        .premium-synopsis {
          font-family: var(--font-body);
          font-size: 1.1rem;
          line-height: 1.8;
          color: rgba(255, 255, 255, 0.65);
          max-width: 650px;
          margin: 0 auto 48px;
        }

        .premium-actions {
          display: flex;
          gap: 20px;
          justify-content: center;
        }

        .btn-premium {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 18px 42px;
          border-radius: 4px;
          font-family: var(--font-heading);
          font-weight: 600;
          font-size: 1rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          text-decoration: none;
          position: relative;
          overflow: hidden;
        }

        .btn-premium::before {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.2), transparent);
          transform: translateX(-100%);
          transition: transform 0.6s;
        }

        .btn-premium:hover::before {
          transform: translateX(100%);
        }

        .btn-book {
          background: var(--gold-500);
          color: #000;
          box-shadow: 0 4px 20px rgba(212, 175, 55, 0.2);
        }

        .btn-book:hover {
          background: var(--gold-400);
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(212, 175, 55, 0.4);
        }

        .btn-trailer {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
        }

        .btn-trailer:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.4);
          transform: translateY(-2px);
        }

        /* Ambient Orbs */
        .ambient-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.3;
          z-index: 0;
          pointer-events: none;
        }
        .orb-crimson {
          background: var(--crimson);
          width: 500px;
          height: 500px;
          top: -10%;
          right: -10%;
        }
        .orb-gold {
          background: var(--gold-500);
          width: 600px;
          height: 600px;
          bottom: -20%;
          left: -10%;
          opacity: 0.15;
        }

        /* Movie Rail Premium */
        .rail-section {
          padding: 80px 0 120px;
          position: relative;
          z-index: 2;
          background: var(--bg-void);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 48px;
          padding: 0 20px;
          max-width: var(--max-width);
          margin-left: auto;
          margin-right: auto;
        }

        .section-title {
          font-family: var(--font-display);
          font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 600;
          color: #fff;
        }

        .section-subtitle {
          font-family: var(--font-heading);
          color: var(--gold-500);
          font-size: 0.9rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          margin-bottom: 12px;
          display: block;
        }

        .view-all {
          color: rgba(255, 255, 255, 0.6);
          font-family: var(--font-heading);
          font-size: 0.9rem;
          font-weight: 500;
          text-decoration: none;
          transition: color 0.3s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .view-all:hover {
          color: var(--gold-500);
        }

        .rail-track {
          display: flex;
          gap: 32px;
          overflow-x: auto;
          padding: 20px;
          margin: 0 auto;
          max-width: var(--max-width);
          scroll-padding: 20px;
          -ms-overflow-style: none;
          scrollbar-width: none;
          scroll-snap-type: x mandatory;
        }

        .rail-track::-webkit-scrollbar { display: none; }

        .premium-poster {
          flex: 0 0 auto;
          width: clamp(240px, 22vw, 320px);
          scroll-snap-align: start;
          text-decoration: none;
          group;
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
          transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
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
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s;
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

        /* Experience Section */
        .experience-section {
          padding: 120px 0;
          background: var(--bg-primary);
          position: relative;
          border-top: 1px solid rgba(255,255,255,0.02);
          border-bottom: 1px solid rgba(255,255,255,0.02);
        }

        .exp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 40px;
          margin-top: 80px;
          max-width: var(--max-width);
          margin-left: auto;
          margin-right: auto;
          padding: 0 20px;
        }

        .exp-card {
          padding: 40px;
          background: var(--bg-card);
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.03);
          transition: all 0.4s ease;
          position: relative;
          overflow: hidden;
        }

        .exp-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 100%; height: 2px;
          background: linear-gradient(90deg, var(--gold-500), var(--crimson));
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.5s ease;
        }

        .exp-card:hover {
          background: var(--bg-elevated);
          transform: translateY(-5px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        }

        .exp-card:hover::before {
          transform: scaleX(1);
        }

        .exp-icon {
          font-size: 2.5rem;
          margin-bottom: 24px;
          background: linear-gradient(135deg, var(--gold-400), var(--gold-600));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .exp-title {
          font-family: var(--font-display);
          font-size: 1.5rem;
          color: #fff;
          margin-bottom: 16px;
        }

        .exp-desc {
          font-family: var(--font-body);
          color: var(--text-secondary);
          line-height: 1.7;
          font-size: 0.95rem;
        }

        /* ── MOBILE RESPONSIVENESS ── */
        @media (max-width: 768px) {
          .premium-title {
            font-size: clamp(2.5rem, 12vw, 4rem);
            margin-bottom: 16px;
          }
          .premium-meta {
            flex-wrap: wrap;
            gap: 12px;
            font-size: 0.85rem;
          }
          .premium-synopsis {
            font-size: 0.95rem;
            margin-bottom: 32px;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .premium-actions {
            flex-direction: column;
            width: 100%;
            gap: 12px;
          }
          .btn-premium {
            width: 100%;
          }
          .section-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 32px;
          }
          .premium-poster {
            width: clamp(180px, 65vw, 280px);
          }
          .experience-section {
            padding: 60px 0;
          }
          .exp-grid {
            margin-top: 40px;
            grid-template-columns: 1fr;
          }
          .exp-card {
            padding: 30px 20px;
          }
        }
      `}} />

      <div className="bg-void min-h-screen">
        <Header />

        <main>
          <HeroCarousel movies={heroMovies} />

          <section className="rail-section">
            <div className="container">
              <div className="section-header">
                <div>
                  <span className="section-subtitle">Now Showing</span>
                  <h2 className="section-title">Curated For You</h2>
                </div>
                <Link href="/movies" className="view-all">
                  Explore Collection →
                </Link>
              </div>

              <MovieCarousel movies={movies} />
            </div>
          </section>

          <section className="experience-section">
            <div className="ambient-orb orb-gold" style={{ top: '10%', right: '0', left: 'auto' }} />
            <div className="container" style={{ position: 'relative', zIndex: 1 }}>
              <div className="section-header" style={{ justifyContent: 'center', textAlign: 'center', padding: 0 }}>
                <div>
                  <span className="section-subtitle">The Dhrub Standard</span>
                  <h2 className="section-title">An Unrivalled Cinematic Journey</h2>
                </div>
              </div>

              <div className="exp-grid">
                {[
                  { icon: '✦', title: 'Dolby Atmos Integration', desc: 'Immerse yourself in multi-dimensional sound with our state-of-the-art Dolby Atmos audio systems, bringing every scene to life.' },
                  { icon: '⟡', title: 'First-Class Recliners', desc: 'Experience movies in unparalleled comfort with our plush, fully-motorized leather reclining seats and expansive legroom.' },
                  { icon: '✺', title: 'Laser Projection', desc: 'Witness crystal-clear imagery, deeper contrasts, and vibrant colors with our next-generation laser projection technology.' },
                  { icon: '✧', title: 'Artisan Culinary', desc: 'Elevate your experience with chef-curated gourmet snacks, premium beverages, and in-seat dining service.' }
                ].map((item, i) => (
                  <div key={i} className="exp-card">
                    <div className="exp-icon">{item.icon}</div>
                    <h3 className="exp-title">{item.title}</h3>
                    <p className="exp-desc">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

        </main>
        <Footer />
      </div>
    </>
  );
}
