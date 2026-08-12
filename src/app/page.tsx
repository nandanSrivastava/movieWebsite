import './home.css';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import HeroCarousel from '@/features/movies/components/HeroCarousel';
import MovieCarousel from '@/features/movies/components/MovieCarousel';
import UpcomingCarousel from '@/features/movies/components/UpcomingCarousel';

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
    { title: 'War 2', date: 'August 2027', poster: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=500&auto=format&fit=crop' },
    { title: 'Krrish 4', date: 'June 2027', poster: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=500&auto=format&fit=crop' },
    { title: 'Toxic', date: 'April 2027', poster: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=500&auto=format&fit=crop' },
    { title: 'Pathaan 2', date: 'October 2027', poster: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?q=80&w=500&auto=format&fit=crop' },
  ];

  return (
    <>

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
              <UpcomingCarousel movies={upcomingMovies} />
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
