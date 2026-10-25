import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AudioLines, Armchair, Projector, Sparkles, MapPin, Car, Phone, Navigation } from 'lucide-react';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import HeroCarousel from '@/features/movies/components/HeroCarousel';
import MovieCarousel from '@/features/movies/components/MovieCarousel';
import UpcomingCarousel from '@/features/movies/components/UpcomingCarousel';
import { istDateString } from '@/lib/istDate';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import styles from './home.module.css';

export const revalidate = 60;

const CINEMA_LOCATION = '27.1401051,84.0555802';

const HALL_FEATURES = [
  { Icon: AudioLines, title: 'Dolby Atmos Integration', desc: 'Immerse yourself in multi-dimensional sound with our state-of-the-art Dolby Atmos audio systems, bringing every scene to life.' },
  { Icon: Armchair, title: 'First-Class Recliners', desc: 'Experience movies in unparalleled comfort with our plush, fully-motorized leather reclining seats and expansive legroom.' },
  { Icon: Projector, title: 'Laser Projection', desc: 'Witness crystal-clear imagery, deeper contrasts, and vibrant colors with our next-generation laser projection technology.' },
  { Icon: Sparkles, title: 'Exclusive Ambiance', desc: 'Step into a world of luxury before the movie even begins, with our elegantly designed foyers and VIP lounges.' },
];

export default async function Home() {
  let movies: Awaited<ReturnType<typeof db.getMovies>>;
  try {
    movies = await db.getMovies();
  } catch (err) {
    // At request time, let it throw: ISR keeps serving the last good page
    // (error.tsx covers the rest) instead of caching an empty catalog.
    // Only during `next build` fall back to [] so a DB hiccup can't fail the
    // deploy — that page is replaced on the first revalidation.
    if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) throw err;
    console.error('[Home] Failed to load movies at build time, rendering empty until revalidation:', err);
    movies = [];
  }
  // Hero: films marked featured. If none are (the live table has no is_featured
  // column), the newest films, so the hero never points at a film that's gone.
  const featuredMovies = movies.filter(m => m.is_featured);
  const newestFirst = [...movies].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  const heroMovies = (featuredMovies.length > 0 ? featuredMovies : newestFirst).slice(0, 5);

  // Today's showtimes for the hero, so a film is two taps from its seat map.
  // Optional: if this read fails the hero simply shows "Book tickets".
  const todaysShows: Record<string, { id: string; show_date: string; show_time: string }[]> = {};
  try {
    const shows = await db.getShowsForDate(istDateString());
    for (const s of [...shows].sort((a, b) => a.show_time.localeCompare(b.show_time))) {
      (todaysShows[s.movie_id] ??= []).push({ id: s.id, show_date: s.show_date, show_time: s.show_time });
    }
  } catch (err) {
    console.error('[Home] Could not load today\'s shows for the hero:', err);
  }

  // Announced theatrical release dates (checked 25 Oct 2026). Move a film into
  // the catalogue from admin when its shows go on sale, and take it off this list.
  const upcomingMovies = [
    { title: 'Ramayana: Part 1', date: '5 November', poster: 'https://image.tmdb.org/t/p/w500/gOWnXaBxqT6k2y40hKfYU6c0Ym.jpg' },
    { title: 'Yeh Prem Mol Liya', date: '27 November', poster: 'https://image.tmdb.org/t/p/w500/kUxkvh6GMZL4AHNgNDty68yTnwQ.jpg' },
    { title: 'Gunmaaster G9', date: '27 November', poster: 'https://image.tmdb.org/t/p/w500/vDYF2q48AIvBRpFiqKj6lKyM0p6.jpg' },
    { title: 'King', date: '24 December', poster: 'https://image.tmdb.org/t/p/w500/74fHULlTBMGGLusfFBVAkMAZbce.jpg' },
  ];

  return (
    <>
      <Header />

      <main>
        <HeroCarousel movies={heroMovies} todaysShows={todaysShows} renderedAt={Date.now()} />

        <section className={`container ${styles.section}`} aria-labelledby="now-showing">
          <h2 id="now-showing" className={styles.heading}>Now showing</h2>
          {movies.length > 0 ? (
            <MovieCarousel movies={movies} />
          ) : (
            <p className={styles.emptyNote}>New films are on their way. Check back soon.</p>
          )}
        </section>

        <section className={`container ${styles.section}`} aria-labelledby="coming-soon">
          <h2 id="coming-soon" className={styles.heading}>Coming soon</h2>
          <UpcomingCarousel movies={upcomingMovies} />
        </section>

        <section className={styles.hallBand} aria-labelledby="inside-hall">
          <div className="container">
            <h2 id="inside-hall" className={`display ${styles.bandTitle}`}>Inside the hall</h2>
            <ul className={styles.features}>
              {HALL_FEATURES.map(({ Icon, title, desc }) => (
                <li key={title} className={styles.feature}>
                  <Icon aria-hidden className={styles.featureIcon} />
                  <h3 className={styles.featureTitle}>{title}</h3>
                  <p className={styles.featureDesc}>{desc}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`container ${styles.section} ${styles.food}`} aria-labelledby="food">
          <div className={styles.foodText}>
            <h2 id="food" className={`display ${styles.bandTitle}`}>In-seat dining</h2>
            <p>Elevate your moviegoing with our chef-curated menu. From artisanal gourmet popcorn to handcrafted beverages and savory delights, our seamless in-seat service ensures you never miss a moment of the action.</p>
            <Link href="/menu" className="btn btn-ghost">See the menu</Link>
          </div>
          <div className={styles.foodGrid}>
            <figure className={styles.foodItem}>
              <Image src="https://images.unsplash.com/photo-1585647347384-2593bc35786b?q=80&w=600&auto=format&fit=crop" alt="Gourmet popcorn" fill sizes="(max-width: 768px) 50vw, 25vw" style={{ objectFit: 'cover' }} />
              <figcaption>Gourmet popcorn</figcaption>
            </figure>
            <figure className={styles.foodItem}>
              <Image src="https://images.unsplash.com/photo-1536935338788-846bb9981813?q=80&w=600&auto=format&fit=crop" alt="Handcrafted beverages" fill sizes="(max-width: 768px) 50vw, 25vw" style={{ objectFit: 'cover' }} />
              <figcaption>Handcrafted beverages</figcaption>
            </figure>
          </div>
        </section>

        <section className={`container ${styles.section} ${styles.visit}`} aria-labelledby="visit">
          <div className={styles.visitInfo}>
            <h2 id="visit" className={`display ${styles.bandTitle}`}>Visit us</h2>
            <dl className={styles.visitList}>
              <div>
                <dt><MapPin aria-hidden />Location</dt>
                <dd>Dhrub Cineplex, Sukhban,<br />Bagaha, Bihar 845105<br />India</dd>
              </div>
              <div>
                <dt><Car aria-hidden />Valet parking</dt>
                <dd>Complimentary valet parking available for VIP and Gold Class ticket holders via the South Gate entrance.</dd>
              </div>
              <div>
                <dt><Phone aria-hidden />Contact</dt>
                <dd>
                  <a href="mailto:concierge@dhrubcineplex.in">concierge@dhrubcineplex.in</a><br />
                  <a href="tel:+919934060014">+91 99340 60014</a>
                </dd>
              </div>
            </dl>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${CINEMA_LOCATION}`} target="_blank" rel="noreferrer" className="btn btn-primary">
              <Navigation aria-hidden />Get directions
            </a>
          </div>
          <div className={styles.map}>
            <iframe
              src={`https://maps.google.com/maps?q=${CINEMA_LOCATION}&hl=en&z=15&output=embed`}
              allowFullScreen={false}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Map showing Dhrub Cineplex in Bagaha"
            ></iframe>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
