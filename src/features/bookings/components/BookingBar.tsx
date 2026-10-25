import React from 'react';
import styles from './BookingBar.module.css';

// Pinned to the bottom of the screen on the seat and checkout pages, so the
// total and the next step are always in reach, wherever the person has scrolled.
export default function BookingBar({ summary, total, action, notice, label = 'Your booking' }: {
  summary: React.ReactNode;
  total?: React.ReactNode;
  action: React.ReactNode;
  notice?: React.ReactNode;
  label?: string;
}) {
  return (
    <section className={styles.bar} aria-label={label} data-bottom-bar>
      {notice && <div className={styles.notice}>{notice}</div>}
      <div className={`container ${styles.inner}`}>
        <div className={styles.summary}>{summary}</div>
        {total && <div className={styles.total}>{total}</div>}
        <div className={styles.action}>{action}</div>
      </div>
    </section>
  );
}
