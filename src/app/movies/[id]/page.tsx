import React from 'react';
import TrailerEmbed from '@/features/movies/components/TrailerEmbed';
import { posterImgProps } from '@/features/shared/utils/posterImage';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import ShowtimePanel from '@/features/movies/components/ShowtimePanel';
import { istDateString } from '@/lib/istDate';
import { formatDuration } from '@/features/shared/utils/format';
import styles from './page.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

// ISR: each movie page is rendered on its first visit, then served from cache
// and refreshed at most every 30s. If a refresh fails (DB blip) the last good
// page keeps being served. Seat availability is not on this page, so 30s of
// staleness is harmless — past showtimes are also filtered client-side.
export const revalidate = 30;

// No paths at build time; an empty list (vs. no export) is what opts this
// dynamic route into runtime ISR instead of rendering on every request.
export async function generateStaticParams() {
  return [];
}

export default async function MovieDetailsPage({ params }: PageProps) {
  const { id } = await params;

  // Fetch movie details and scheduling
  const movie = await db.getMovieById(id);
  if (!movie) {
    notFound();
  }

  // Only today onward (cinema time, IST) — older shows would just bloat the
  // page payload. ShowtimePanel drops today's already-started shows.
  const today = istDateString();
  const shows = (await db.getShowsForMovie(id)).filter((s) => s.show_date >= today);
  const genres = (movie.genre || '').split(',').map(g => g.trim()).filter(Boolean);

  return (
    <>
      <Header />
      <main className={styles.page}>
        {/* Poster, blurred, as a low wash of colour behind the header */}
        {movie.poster_url && (
          <div className={styles.backdrop} aria-hidden>
            <img {...posterImgProps(movie.poster_url, '', 96, 144)} alt="" />
          </div>
        )}

        <div className={`container ${styles.layout}`}>
          <Link href="/movies" className={styles.back}><ChevronLeft aria-hidden />All movies</Link>

          <div className={styles.posterCol}>
            <div className={styles.poster}>
              <img {...posterImgProps(movie.poster_url, movie.title, 400, 600, true)} alt={`${movie.title} poster`} />
            </div>
          </div>

          <header className={styles.intro}>
            <h1 className={`display ${styles.title}`}>{movie.title}</h1>
            <ul className={styles.meta} aria-label="Film details">
              {movie.certification && <li className={styles.cert} title="Certificate">{movie.certification}</li>}
              {movie.duration_minutes ? <li>{formatDuration(movie.duration_minutes)}</li> : null}
              {movie.language && <li>{movie.language}</li>}
            </ul>
            {genres.length > 0 && (
              <ul className={styles.genres} aria-label="Genres">
                {genres.map(g => <li key={g}>{g}</li>)}
              </ul>
            )}
          </header>

          <section className={styles.showtimes} id="showtimes" aria-labelledby="showtimes-heading">
            <h2 id="showtimes-heading" className={styles.sectionTitle}>Book tickets</h2>
            <ShowtimePanel shows={shows} renderedAt={Date.now()} />
          </section>

          {movie.synopsis && (
            <section className={styles.about} aria-labelledby="about-heading">
              <h2 id="about-heading" className={styles.sectionTitle}>The story</h2>
              <p className={styles.synopsis}>{movie.synopsis}</p>
            </section>
          )}

          {movie.trailer_url && (
            <section className={styles.trailer} id="trailer" aria-labelledby="trailer-heading">
              <h2 id="trailer-heading" className={styles.sectionTitle}>Trailer</h2>
              <div className={styles.trailerFrame}>
                <TrailerEmbed url={movie.trailer_url} title={movie.title} />
              </div>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
