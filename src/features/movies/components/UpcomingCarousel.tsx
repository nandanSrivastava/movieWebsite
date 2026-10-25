import React from 'react';
import Image from 'next/image';
import styles from './UpcomingCarousel.module.css';

interface UpcomingMovie {
  title: string;
  date: string;
  poster: string;
}

// "Coming soon" row: swipe on phones, a plain row on desktop. Not links,
// since these films don't have pages or showtimes yet.
export default function UpcomingCarousel({ movies }: { movies: UpcomingMovie[] }) {
  return (
    <ul className={styles.track}>
      {movies.map((movie) => (
        <li key={movie.title} className={styles.card}>
          <Image
            src={movie.poster}
            alt=""
            fill
            sizes="(max-width: 640px) 60vw, 280px"
            style={{ objectFit: 'cover' }}
          />
          <div className={styles.info}>
            <span className={styles.date}>{movie.date}</span>
            <h3 className={`display ${styles.title}`}>{movie.title}</h3>
          </div>
        </li>
      ))}
    </ul>
  );
}
