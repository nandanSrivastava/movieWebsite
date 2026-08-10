import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  // Fallback to title matching if is_featured column is missing in the database
  const featuredMovies = movies.filter(m => m.is_featured || ['Bahubali', 'Pathaan', 'Jawan', 'Animal'].includes(m.title));
  const heroMovies = featuredMovies.length > 0 ? featuredMovies : [movies[0]].filter(Boolean);

  const upcomingMovies = [
    { title: 'Kalki 2898 AD', date: 'May 2026', poster: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=500&auto=format&fit=crop' },
    { title: 'Fighter', date: 'August 2026', poster: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=500&auto=format&fit=crop' },
    { title: 'Pushpa 2: The Rule', date: 'December 2026', poster: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=500&auto=format&fit=crop' },
    { title: 'Singham Again', date: 'November 2026', poster: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?q=80&w=500&auto=format&fit=crop' },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
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
          animation: cinematicPan 30s ease-in-out infinite alternate;
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
          position: relative;
        }

        .hero-badge-dot::after {
          content: '';
          position: absolute;
          inset: 0;
          background-color: var(--crimson);
          border-radius: 50%;
          animation: pulseCrimson 2s infinite;
        }

        @keyframes pulseCrimson {
          0% { transform: scale(1); opacity: 0.7; }
          70% { transform: scale(3.5); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
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
          font-size: 0.95rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          transition: all 0.5s var(--ease-snappy);
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
          transform: translateY(-2px) scale(1.02);
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
          transform: translateY(-2px) scale(1.02);
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
          transition: all 0.5s var(--ease-out-expo);
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
          transition: transform 0.6s var(--ease-snappy);
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
          .culinary-content, .location-container {
            grid-template-columns: 1fr;
            gap: 40px;
          }
          .map-wrapper {
            height: 350px;
          }
        }

        /* Upcoming Section */
        .upcoming-section {
          padding: 80px 0;
          background: linear-gradient(to bottom, var(--bg-void), var(--bg-primary));
        }
        
        .upcoming-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 32px;
          max-width: var(--max-width);
          margin: 0 auto;
          padding: 0 20px;
        }

        .upcoming-card {
          position: relative;
          border-radius: 8px;
          overflow: hidden;
          aspect-ratio: 2/3;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          transition: transform 0.4s var(--ease-snappy);
        }

        .upcoming-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.8), 0 0 30px rgba(212, 175, 55, 0.1);
          border: 1px solid rgba(212, 175, 55, 0.3);
        }

        .upcoming-card img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: brightness(0.85);
          transition: transform 0.8s ease;
        }
        
        .upcoming-card:hover img {
          transform: scale(1.05);
        }

        .upcoming-info {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          padding: 24px;
          background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
        }

        .upcoming-date {
          color: var(--gold-500);
          font-family: var(--font-heading);
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 4px;
          display: block;
        }

        .upcoming-title {
          color: white;
          font-family: var(--font-display);
          font-size: 1.25rem;
          font-weight: 600;
        }

        /* Culinary Section */
        .culinary-section {
          padding: 120px 0;
          background: var(--bg-primary);
          position: relative;
          overflow: hidden;
          border-top: 1px solid rgba(255,255,255,0.02);
        }

        .culinary-content {
          max-width: var(--max-width);
          margin: 0 auto;
          padding: 0 20px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 64px;
          align-items: center;
        }

        .culinary-text h2 {
          font-family: var(--font-display);
          font-size: clamp(2.5rem, 4vw, 3.5rem);
          color: #fff;
          margin-bottom: 24px;
          line-height: 1.1;
        }

        .culinary-text p {
          color: rgba(255,255,255,0.7);
          font-family: var(--font-body);
          font-size: 1.1rem;
          line-height: 1.8;
          margin-bottom: 40px;
        }

        .culinary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .culinary-item {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          aspect-ratio: 4/5;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }

        .culinary-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.8s ease;
        }

        .culinary-item:hover img {
          transform: scale(1.08);
        }

        .culinary-item-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%);
          display: flex;
          align-items: flex-end;
          padding: 24px;
        }

        .culinary-item-title {
          color: #fff;
          font-family: var(--font-heading);
          font-size: 1.1rem;
          font-weight: 500;
          letter-spacing: 0.05em;
        }

        /* Location Section */
        .location-section {
          padding: 120px 0;
          background: var(--bg-void);
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .location-container {
          max-width: var(--max-width);
          margin: 0 auto;
          padding: 0 20px;
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 40px;
        }

        .location-info h2 {
          font-family: var(--font-display);
          font-size: 2.5rem;
          color: #fff;
          margin-bottom: 24px;
        }

        .location-details {
          color: rgba(255,255,255,0.7);
          font-family: var(--font-body);
          line-height: 1.8;
        }

        .location-details strong {
          color: var(--gold-500);
          display: block;
          margin-top: 24px;
          margin-bottom: 8px;
          font-family: var(--font-heading);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-size: 0.9rem;
        }

        .map-wrapper {
          border-radius: 12px;
          overflow: hidden;
          height: 450px;
          border: 1px solid rgba(255,255,255,0.1);
        }

        .map-wrapper iframe {
          width: 100%;
          height: 100%;
          border: 0;
          /* Magic dark mode filter for Google Maps */
          filter: invert(90%) hue-rotate(180deg) brightness(85%) contrast(120%);
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

          <section className="upcoming-section">
            <div className="container">
              <div className="section-header">
                <div>
                  <span className="section-subtitle">Coming Soon</span>
                  <h2 className="section-title">Anticipated Premieres</h2>
                </div>
              </div>
              <div className="upcoming-grid">
                {upcomingMovies.map((movie, i) => (
                  <div key={i} className="upcoming-card">
                    <Image src={movie.poster} alt={movie.title} fill sizes="(max-width: 768px) 100vw, 33vw" style={{ objectFit: 'cover' }} />
                    <div className="upcoming-info">
                      <span className="upcoming-date">{movie.date}</span>
                      <h3 className="upcoming-title">{movie.title}</h3>
                    </div>
                  </div>
                ))}
              </div>
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
                  { icon: '✧', title: 'Exclusive Ambiance', desc: 'Step into a world of luxury before the movie even begins, with our elegantly designed foyers and VIP lounges.' }
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

          <section className="culinary-section">
            <div className="culinary-content">
              <div className="culinary-text">
                <span className="section-subtitle">In-Seat Dining</span>
                <h2>The Culinary<br />Experience</h2>
                <p>Elevate your moviegoing with our chef-curated menu. From artisanal gourmet popcorn to handcrafted beverages and savory delights, our seamless in-seat service ensures you never miss a moment of the action.</p>
                <Link href="/menu" className="btn-premium btn-trailer">View Menu</Link>
              </div>
              <div className="culinary-grid">
                <div className="culinary-item" style={{ transform: 'translateY(40px)' }}>
                  <Image src="https://images.unsplash.com/photo-1585647347384-2593bc35786b?q=80&w=600&auto=format&fit=crop" alt="Gourmet Popcorn" fill sizes="(max-width: 768px) 100vw, 50vw" style={{ objectFit: 'cover' }} />
                  <div className="culinary-item-overlay"><span className="culinary-item-title">Gourmet Popcorn</span></div>
                </div>
                <div className="culinary-item">
                  <Image src="https://images.unsplash.com/photo-1536935338788-846bb9981813?q=80&w=600&auto=format&fit=crop" alt="Handcrafted Beverages" fill sizes="(max-width: 768px) 100vw, 50vw" style={{ objectFit: 'cover' }} />
                  <div className="culinary-item-overlay"><span className="culinary-item-title">Handcrafted Beverages</span></div>
                </div>
              </div>
            </div>
          </section>

          <section className="location-section">
            <div className="location-container">
              <div className="location-info">
                <h2>Visit Us</h2>
                <div className="location-details">
                  <strong>Location</strong>
                  Dhrub Cineplex, Sukhban,<br />
                  Bagaha, Bihar 845105<br />
                  India

                  <strong>Valet Parking</strong>
                  Complimentary valet parking available for VIP and Gold Class ticket holders via the South Gate entrance.

                  <strong>Contact</strong>
                  concierge@dhrubcineplex.in <br />
                  +91 99340 60014
                </div>
              </div>
              <div className="map-wrapper">
                <iframe
                  src="https://maps.google.com/maps?q=27.1401051,84.0555802&hl=en&z=15&output=embed"
                  allowFullScreen={false}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Dhrub Cineplex Location"
                ></iframe>
              </div>
            </div>
          </section>

        </main>
        <Footer />
      </div>
    </>
  );
}
