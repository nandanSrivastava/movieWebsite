'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MovieCard from './MovieCard';
import LanguageFilter from './LanguageFilter';
import { languageOptions, matchesLanguage } from '../utils/languages';
import styles from './MovieCarousel.module.css';

// Home page "Now showing" row. Moves only when the person scrolls or presses
// an arrow: a row that slides by itself fights the thumb on a phone.
export default function MovieCarousel({ movies }: { movies: any[] }) {
  const scrollRef = useRef<HTMLUListElement>(null);
  const [lang, setLang] = useState<string | null>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const options = languageOptions(movies);
  const visible = movies.filter(m => matchesLanguage(m, lang));

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }, []);

  useEffect(() => {
    updateEdges();
    scrollRef.current?.scrollTo({ left: 0 });
  }, [lang, updateEdges]);

  const scroll = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className={styles.wrap}>
      <LanguageFilter options={options} value={lang} onChange={setLang} />

      {visible.length === 0 ? (
        <p className={styles.empty}>
          No {lang} films right now. <button type="button" className={styles.reset} onClick={() => setLang(null)}>Show all movies</button>
        </p>
      ) : (
        <div className={styles.rail}>
          <button type="button" className={`${styles.arrow} ${styles.prev}`} onClick={() => scroll(-1)} disabled={edges.start} aria-label="Scroll movies left">
            <ChevronLeft aria-hidden />
          </button>
          <ul className={styles.track} ref={scrollRef} onScroll={updateEdges}>
            {visible.map((movie, i) => (
              <li key={movie.id} className={styles.item}>
                <MovieCard movie={movie} priority={i < 2} />
              </li>
            ))}
          </ul>
          <button type="button" className={`${styles.arrow} ${styles.next}`} onClick={() => scroll(1)} disabled={edges.end} aria-label="Scroll movies right">
            <ChevronRight aria-hidden />
          </button>
        </div>
      )}

      <Link href={lang ? `/movies?lang=${encodeURIComponent(lang)}` : '/movies'} className={`btn btn-quiet ${styles.all}`}>
        See all movies
      </Link>
    </div>
  );
}
