'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { posterImgProps } from '@/features/shared/utils/posterImage';
import { formatDuration, formatShowTime, hasShowStarted } from '@/features/shared/utils/format';
import styles from './HeroCarousel.module.css';

type HeroShow = { id: string; show_time: string; show_date: string };
const ROTATE_MS = 7000;
const MAX_TIMES = 4;

export default function HeroCarousel({ movies, todaysShows = {}, renderedAt }: {
  movies: any[];
  todaysShows?: Record<string, HeroShow[]>;
  renderedAt: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);     // pressed pause, or navigated by hand
  const [hovering, setHovering] = useState(false); // pointer or focus inside
  const [reducedMotion, setReducedMotion] = useState(false);
  const [now, setNow] = useState(renderedAt);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    setNow(Date.now());
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const rotating = movies.length > 1 && !paused && !hovering && !reducedMotion;
  useEffect(() => {
    if (!rotating) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % movies.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [rotating, movies.length]);

  if (!movies.length) return null;

  const go = (step: number) => {
    setPaused(true);
    setIndex(i => (i + step + movies.length) % movies.length);
  };

  const movie = movies[index];
  const times = (todaysShows[movie.id] || []).filter(s => !hasShowStarted(s.show_date, s.show_time, now));

  return (
    <section
      ref={sectionRef}
      className={styles.hero}
      aria-roledescription="carousel"
      aria-label="Now showing"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={(e) => { if (!sectionRef.current?.contains(e.relatedTarget as Node)) setHovering(false); }}
    >
      <div key={`bg-${movie.id}`} className={styles.backdrop} aria-hidden>
        <img {...posterImgProps(movie.poster_url, '', 96, 144, index === 0)} alt="" />
      </div>

      <div className={`container ${styles.inner}`}>
        <div
          key={movie.id}
          className={styles.slide}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${movies.length}: ${movie.title}`}
        >
          <Link href={`/movies/${movie.id}`} className={styles.poster} tabIndex={-1} aria-hidden>
            <img {...posterImgProps(movie.poster_url, '', 400, 600, index === 0)} alt="" />
          </Link>

          <div className={styles.copy}>
            <p className={styles.kicker}>Now showing</p>
            <h1 className={`display ${styles.title}`}>{movie.title}</h1>
            <ul className={styles.meta} aria-label="Film details">
              {movie.certification && <li className={styles.cert}>{movie.certification}</li>}
              {movie.duration_minutes ? <li>{formatDuration(movie.duration_minutes)}</li> : null}
              {movie.language && <li>{movie.language}</li>}
            </ul>
          </div>

          <div className={styles.details}>
            {movie.synopsis && <p className={styles.synopsis}>{movie.synopsis}</p>}

            {times.length > 0 ? (
              <div className={styles.today}>
                <p className={styles.todayLabel}>Today</p>
                <ul className={styles.times}>
                  {times.slice(0, MAX_TIMES).map(s => (
                    <li key={s.id}>
                      <Link href={`/booking/${s.id}`} className={styles.time} aria-label={`Book today at ${formatShowTime(s.show_time)}`}>
                        {formatShowTime(s.show_time)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className={styles.actions}>
              <Link href={`/movies/${movie.id}#showtimes`} className="btn btn-primary btn-lg">
                {times.length > 0 ? 'All showtimes' : 'Book tickets'}
              </Link>
              {movie.trailer_url && (
                <Link href={`/movies/${movie.id}#trailer`} className="btn btn-ghost btn-lg">Watch trailer</Link>
              )}
            </div>
          </div>
        </div>

        {movies.length > 1 && (
          <div className={styles.controls}>
            <button type="button" className={styles.control} onClick={() => go(-1)} aria-label="Previous film">
              <ChevronLeft aria-hidden />
            </button>
            <span className={styles.position} aria-live={rotating ? 'off' : 'polite'}>
              {index + 1} / {movies.length}
            </span>
            <button type="button" className={styles.control} onClick={() => go(1)} aria-label="Next film">
              <ChevronRight aria-hidden />
            </button>
            {!reducedMotion && (
              <button
                type="button"
                className={styles.control}
                onClick={() => setPaused(p => !p)}
                aria-label={paused ? 'Resume rotating films' : 'Pause rotating films'}
              >
                {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
