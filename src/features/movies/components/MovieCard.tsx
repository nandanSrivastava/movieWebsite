import React from 'react';
import Link from 'next/link';
import { posterImgProps } from '@/features/shared/utils/posterImage';
import { formatDuration } from '@/features/shared/utils/format';
import styles from './MovieCard.module.css';

type CardMovie = {
  id: string;
  title: string;
  poster_url: string;
  certification?: string | null;
  language?: string | null;
  genre?: string | null;
  duration_minutes?: number | null;
};

// Poster card used in the home rail and the movies grid. The whole card is one link.
export default function MovieCard({ movie, priority = false, showDuration = false }: { movie: CardMovie; priority?: boolean; showDuration?: boolean }) {
  const genre = movie.genre?.split(',')[0]?.trim();
  return (
    <Link href={`/movies/${movie.id}`} className={styles.card}>
      <span className={styles.poster}>
        <img {...posterImgProps(movie.poster_url, '', 320, 480, priority)} alt="" />
        <span className={styles.book} aria-hidden>Book</span>
      </span>
      <span className={styles.title}>{movie.title}</span>
      <span className={styles.meta}>
        {movie.certification && <span className={styles.cert}>{movie.certification}</span>}
        {[movie.language, showDuration ? formatDuration(movie.duration_minutes) : genre].filter(Boolean).map(part => (
          <span key={String(part)} className={styles.metaText}>{part}</span>
        ))}
      </span>
    </Link>
  );
}
