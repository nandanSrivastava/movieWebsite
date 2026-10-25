'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import MovieCard from './MovieCard';
import LanguageFilter from './LanguageFilter';
import { languageOptions, matchesLanguage } from '../utils/languages';
import styles from './MovieBrowser.module.css';

// The /movies grid with a language filter. The choice lives in ?lang= so it can
// be shared or linked from the home page.
export default function MovieBrowser({ movies }: { movies: any[] }) {
  const options = languageOptions(movies);
  const [lang, setLang] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (fromUrl && options.includes(fromUrl)) setLang(fromUrl);
    // options derive from the server-rendered list, which doesn't change here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (next: string | null) => {
    setLang(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('lang', next); else url.searchParams.delete('lang');
    window.history.replaceState(null, '', url);
  };

  const visible = movies.filter(m => matchesLanguage(m, lang));

  if (movies.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No films are showing right now</p>
        <p>Check back soon for new releases.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <LanguageFilter options={options} value={lang} onChange={choose} />
      <p className={styles.count} aria-live="polite">
        {visible.length} {visible.length === 1 ? 'film' : 'films'}{lang ? ` in ${lang}` : ''}
      </p>
      {visible.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No {lang} films right now</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => choose(null)}>Show all movies</button>
        </div>
      ) : (
        <ul className={styles.grid}>
          {visible.map((movie, i) => (
            <li key={movie.id}><MovieCard movie={movie} priority={i < 4} showDuration /></li>
          ))}
        </ul>
      )}
      <p className={styles.help}>Already booked? <Link href="/booking/lookup">Find your ticket</Link></p>
    </div>
  );
}
