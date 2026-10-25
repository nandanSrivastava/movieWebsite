'use client';

import React from 'react';
import { Languages } from 'lucide-react';
import styles from './LanguageFilter.module.css';

// Chips for "All" plus each spoken language. Hidden when there's only one.
export default function LanguageFilter({ options, value, onChange }: {
  options: string[];
  value: string | null;
  onChange: (lang: string | null) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className={styles.wrap} role="group" aria-label="Filter by language">
      <Languages aria-hidden className={styles.icon} />
      <button type="button" className={styles.chip} aria-pressed={value === null} onClick={() => onChange(null)}>All</button>
      {options.map(lang => (
        <button key={lang} type="button" className={styles.chip} aria-pressed={value === lang} onClick={() => onChange(value === lang ? null : lang)}>
          {lang}
        </button>
      ))}
    </div>
  );
}
