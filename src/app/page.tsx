import React from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';

export const revalidate = 60;

export default async function Home() {
  let movies: Awaited<ReturnType<typeof db.getMovies>> = [];
  try {
    movies = await db.getMovies();
  } catch (err) {
    console.error('[Home] Failed to load movies from DB:', err);
    // Page renders with empty state rather than crashing
  }
  const hero = movies[0];
  const rest = movies.slice(1);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        /* ── HERO ──────────────────────────────────── */
        .hero-section {
          position: relative;
          height: 100svh;
          min-height: 700px;
          max-height: 1000px;
          width: 100%;
          display: flex;
          align-items: flex-end;
          overflow: hidden;
          margin-top: calc(-1 * var(--header-height));
        }
        .hero-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
        }
        .hero-bg img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 20%;
          filter: brightness(0.55) saturate(1.2);
          transform-origin: center;
          animation: heroZoom 12s ease-in-out alternate infinite;
        }
        @keyframes heroZoom {
          from { transform: scale(1.00); }
          to   { transform: scale(1.06); }
        }
        .hero-gradient-left {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            105deg,
            #050507 0%,
            rgba(5,5,7,0.85) 30%,
            rgba(5,5,7,0.30) 65%,
            transparent 100%
          );
        }
        .hero-gradient-bottom {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 55%;
          background: linear-gradient(
            to top,
            #050507 0%,
            rgba(5,5,7,0.9) 20%,
            transparent 100%
          );
        }
        .hero-content {
          position: relative;
          z-index: 2;
          padding-bottom: clamp(140px, 18vh, 220px);
          width: 100%;
        }
        .hero-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: rgba(197,168,128,0.10);
          border: 1px solid rgba(197,168,128,0.22);
          border-radius: 99px;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--gold-500);
          margin-bottom: 24px;
        }
        .hero-eyebrow::before {
          content: '';
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--gold-500);
          box-shadow: 0 0 6px var(--gold-500);
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.4; transform:scale(1.4); }
        }
        .hero-title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(3rem, 7vw, 6.5rem);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.02em;
          color: #fff;
          text-shadow: 0 4px 40px rgba(0,0,0,0.6);
          margin-bottom: 20px;
          max-width: 760px;
        }
        .hero-meta {
          display: flex;
          align-items: center;
          gap: 0;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }
        .hero-meta-item {
          font-size: 0.95rem;
          font-weight: 500;
          color: rgba(255,255,255,0.7);
          padding: 0 16px;
          border-right: 1px solid rgba(255,255,255,0.2);
        }
        .hero-meta-item:first-child { padding-left: 0; }
        .hero-meta-item:last-child { border-right: none; }
        .hero-meta-cert {
          color: var(--gold-500);
          font-weight: 700;
        }
        .hero-synopsis {
          font-size: 1.05rem;
          line-height: 1.7;
          color: rgba(255,255,255,0.65);
          max-width: 560px;
          margin-bottom: 40px;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .hero-ctas {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
        }

        /* ── SCROLL INDICATOR ───────────────────────── */
        .scroll-indicator {
          position: absolute;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          opacity: 0.5;
          animation: fadeIn 2s 1.5s both;
        }
        .scroll-indicator span {
          font-size: 0.7rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #fff;
        }
        .scroll-mouse {
          width: 22px;
          height: 34px;
          border: 1.5px solid rgba(255,255,255,0.4);
          border-radius: 11px;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 5px;
        }
        .scroll-mouse::after {
          content: '';
          width: 3px;
          height: 7px;
          background: #fff;
          border-radius: 99px;
          animation: scrollDown 1.5s ease infinite;
        }
        @keyframes scrollDown {
          from { opacity:1; transform:translateY(0); }
          to   { opacity:0; transform:translateY(10px); }
        }

        /* ── NOW PLAYING RAIL ───────────────────────── */
        .rail-section {
          position: relative;
          z-index: 3;
          margin-top: 0;
          padding-top: 60px;
          padding-bottom: 80px;
        }
        .rail-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 36px;
        }
        .rail-title {
          font-family: 'Outfit', sans-serif;
          font-size: clamp(1.6rem, 3vw, 2.4rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #fff;
        }
        .rail-subtitle {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.4);
          margin-top: 4px;
        }
        .rail-track {
          display: flex;
          gap: 20px;
          overflow-x: auto;
          padding-bottom: 20px;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .rail-track::-webkit-scrollbar { display: none; }

        /* Poster Card */
        .pc-wrap {
          flex: 0 0 auto;
          width: clamp(160px, 18vw, 230px);
          text-decoration: none;
        }
        .pc-frame {
          width: 100%;
          aspect-ratio: 2/3;
          border-radius: 14px;
          overflow: hidden;
          position: relative;
          box-shadow: 0 15px 40px rgba(0,0,0,0.7);
          transition: transform 0.4s cubic-bezier(0.25,1,0.5,1), box-shadow 0.4s ease;
        }
        .pc-frame img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.5s ease;
        }
        .pc-frame:hover {
          transform: translateY(-16px) scale(1.03);
          box-shadow: 0 30px 70px rgba(0,0,0,0.9), 0 0 40px var(--gold-glow);
        }
        .pc-frame:hover img { transform: scale(1.07); }
        .pc-veil {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to top,
            rgba(0,0,0,0.97) 0%,
            rgba(0,0,0,0.4) 45%,
            transparent 100%
          );
          opacity: 0;
          transition: opacity 0.3s ease;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 20px 16px;
        }
        .pc-frame:hover .pc-veil { opacity: 1; }
        .pc-veil-play {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--gold-500);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: #000;
          margin-bottom: 10px;
          box-shadow: 0 0 20px var(--gold-glow-strong);
        }
        .pc-veil-label {
          font-size: 0.88rem;
          font-weight: 700;
          color: #fff;
          font-family: 'Outfit', sans-serif;
        }
        .pc-info { margin-top: 14px; }
        .pc-title {
          font-size: 1rem;
          font-weight: 700;
          color: #fff;
          font-family: 'Outfit', sans-serif;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 5px;
        }
        .pc-tags {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          color: rgba(255,255,255,0.45);
          font-weight: 500;
        }
        .pc-cert {
          color: var(--gold-500);
          font-weight: 700;
        }

        /* ── SECTION: EXPERIENCE ────────────────────── */
        .exp-section {
          padding: 120px 0;
          position: relative;
          overflow: hidden;
        }
        .exp-bg-orb-1 {
          position: absolute;
          top: -100px;
          left: -150px;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(197,168,128,0.04) 0%, transparent 70%);
          pointer-events: none;
        }
        .exp-bg-orb-2 {
          position: absolute;
          bottom: -100px;
          right: -150px;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(150,40,40,0.03) 0%, transparent 70%);
          pointer-events: none;
        }
        .exp-header {
          text-align: center;
          margin-bottom: 72px;
        }
        .exp-tagline {
          display: inline-block;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gold-500);
          margin-bottom: 16px;
        }
        .exp-title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(2rem, 4vw, 3.5rem);
          font-weight: 700;
          font-style: italic;
          color: #fff;
          letter-spacing: -0.01em;
        }
        .exp-title em {
          font-style: normal;
          color: var(--gold-500);
        }
        .exp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 24px;
        }
        .exp-card {
          padding: 44px 32px;
          border-radius: 20px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          transition: all 0.38s cubic-bezier(0.25,1,0.5,1);
          position: relative;
          overflow: hidden;
        }
        .exp-card::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 0;
          height: 2px;
          background: linear-gradient(to right, var(--gold-500), transparent);
          transition: width 0.4s ease;
        }
        .exp-card:hover {
          transform: translateY(-12px);
          border-color: var(--border-gold);
          background: rgba(255,255,255,0.03);
          box-shadow: 0 24px 60px rgba(0,0,0,0.5), 0 0 40px var(--gold-glow);
        }
        .exp-card:hover::after { width: 100%; }
        .exp-icon {
          font-size: 2.4rem;
          margin-bottom: 22px;
          display: block;
          filter: drop-shadow(0 0 10px rgba(212,175,55,0.3));
          transition: transform 0.3s ease;
        }
        .exp-card:hover .exp-icon { transform: scale(1.15); }
        .exp-card-title {
          font-family: 'Outfit', sans-serif;
          font-size: 1.2rem;
          font-weight: 800;
          color: #fff;
          margin-bottom: 12px;
        }
        .exp-card-body {
          font-size: 0.93rem;
          line-height: 1.7;
          color: rgba(255,255,255,0.5);
        }

        /* ── SECTION: STATS BAR ─────────────────────── */
        .stats-section {
          padding: 70px 0;
          border-top: 1px solid rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0;
        }
        .stat-item {
          text-align: center;
          padding: 24px 16px;
          border-right: 1px solid rgba(255,255,255,0.06);
        }
        .stat-item:last-child { border-right: none; }
        .stat-number {
          font-family: 'Playfair Display', serif;
          font-size: 2.8rem;
          font-weight: 800;
          color: var(--gold-500);
          letter-spacing: -0.02em;
          line-height: 1;
          margin-bottom: 6px;
        }
        .stat-label {
          font-size: 0.82rem;
          font-weight: 600;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
        }

        /* ── GRADIENT SEPARATOR ─────────────────────── */
        .gradient-sep {
          width: 100%;
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(197,168,128,0.2), transparent);
        }
      `}} />

      <div style={{ backgroundColor: 'var(--bg-void)', minHeight: '100vh', overflowX: 'hidden' }}>
        <Header />

        <main>
          {/* ══════════ HERO ══════════ */}
          {hero && (
            <section className="hero-section">
              {/* Background */}
              <div className="hero-bg">
                <img src={hero.poster_url} alt={hero.title} />
                <div className="hero-gradient-left" />
                <div className="hero-gradient-bottom" />
              </div>

              {/* Content */}
              <div className="hero-content">
                <div className="container">
                  <p className="hero-eyebrow animate-fade-up">
                    Dhrub Cineplex · Featured Tonight
                  </p>

                  <h1 className="hero-title animate-fade-up-delay-1">
                    {hero.title}
                  </h1>

                  <div className="hero-meta animate-fade-up-delay-2">
                    <span className="hero-meta-item hero-meta-cert">★ {hero.certification}</span>
                    <span className="hero-meta-item">{hero.genre}</span>
                    <span className="hero-meta-item">{hero.duration_minutes} min</span>
                    <span className="hero-meta-item">{hero.language}</span>
                  </div>

                  <p className="hero-synopsis animate-fade-up-delay-3">
                    {hero.synopsis}
                  </p>

                  <div className="hero-ctas animate-fade-up-delay-4">
                    <Link href={`/movies/${hero.id}`} className="btn-hero-primary">
                      🎟 Book Tickets Now
                    </Link>
                    <Link href={`/movies/${hero.id}`} className="btn-hero-ghost">
                      ▶ Watch Trailer
                    </Link>
                  </div>
                </div>
              </div>

              {/* Scroll nudge */}
              <div className="scroll-indicator">
                <div className="scroll-mouse" />
                <span>Scroll</span>
              </div>
            </section>
          )}

          {/* ══════════ NOW PLAYING RAIL ══════════ */}
          <section className="rail-section">
            <div className="container">
              <div className="rail-header">
                <div>
                  <h2 className="rail-title">Now Playing</h2>
                  <p className="rail-subtitle">Running shows at Bagaha's finest screen</p>
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#D4AF37', opacity: 0.8, letterSpacing: '0.02em' }}>
                  View All →
                </span>
              </div>

              <div className="rail-track">
                {movies.map((movie) => (
                  <Link
                    key={movie.id}
                    href={`/movies/${movie.id}`}
                    className="pc-wrap"
                  >
                    <div className="pc-frame">
                      <img src={movie.poster_url} alt={movie.title} />
                      <div className="pc-veil">
                        <div className="pc-veil-play">▶</div>
                        <span className="pc-veil-label">Book Tickets</span>
                      </div>
                    </div>
                    <div className="pc-info">
                      <p className="pc-title">{movie.title}</p>
                      <div className="pc-tags">
                        <span className="pc-cert">{movie.certification}</span>
                        <span>·</span>
                        <span>{movie.genre.split(',')[0].trim()}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* ══════════ STATS ══════════ */}
          <section className="stats-section">
            <div className="container">
              <div className="stats-grid">
                {[
                  { n: '2', label: 'Premium Screens' },
                  { n: '4+', label: 'Daily Shows' },
                  { n: '280', label: 'Seats Available' },
                  { n: '∞', label: 'Memories Made' },
                ].map(s => (
                  <div key={s.label} className="stat-item">
                    <div className="stat-number">{s.n}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ══════════ EXPERIENCE SECTION ══════════ */}
          <section className="exp-section">
            <div className="exp-bg-orb-1" />
            <div className="exp-bg-orb-2" />
            <div className="container" style={{ position: 'relative', zIndex: 1 }}>
              <div className="exp-header">
                <p className="exp-tagline">The Dhrub Standard</p>
                <h2 className="exp-title">
                  Where every visit feels like <em>opening night</em>.
                </h2>
              </div>
              <div className="exp-grid">
                {[
                  { icon: '🎬', title: 'IMAX with Laser', body: 'Industry-leading projection technology delivering 60% brighter images, deepest contrast, and unmatched clarity for a fully immersive experience.' },
                  { icon: '💺', title: 'Gold Class Recliners', body: 'Handcrafted motorised leather recliners with extended footrests, personal consoles, and in-seat dining service on request.' },
                  { icon: '🔊', title: 'Dolby Atmos Sound', body: '64-channel three-dimensional audio that places every sound in its precise position around and above you — total immersion.' },
                  { icon: '🍿', title: 'Artisan Concessions', body: 'Chef-crafted menus, freshly brewed beverages, and signature popcorn blends curated to complement each film.' },
                ].map(f => (
                  <div key={f.title} className="exp-card">
                    <span className="exp-icon">{f.icon}</span>
                    <h3 className="exp-card-title">{f.title}</h3>
                    <p className="exp-card-body">{f.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="gradient-sep" />
        </main>

        <Footer />
      </div>
    </>
  );
}
