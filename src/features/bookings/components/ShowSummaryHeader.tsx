import React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ShowType } from '@/lib/db';
import { formatShowDay, formatShowTime } from '@/features/shared/utils/format';
import { posterImgProps } from '@/features/shared/utils/posterImage';
import StepIndicator, { BookingStep } from './StepIndicator';
import styles from './ShowSummaryHeader.module.css';

// Top of the seat and checkout pages: what you're booking, and where you are in the flow
export default function ShowSummaryHeader({ show, step, backHref, backLabel }: {
  show: ShowType;
  step: BookingStep;
  backHref?: string;
  backLabel?: string;
}) {
  const movie = show.movie;
  return (
    <div className={styles.wrap}>
      <div className={styles.topRow}>
        {backHref && (
          <Link href={backHref} className={styles.back}>
            <ChevronLeft aria-hidden />{backLabel ?? 'Back'}
          </Link>
        )}
        <StepIndicator current={step} />
      </div>

      <div className={styles.show}>
        {movie?.poster_url && (
          <span className={styles.poster}>
            <img {...posterImgProps(movie.poster_url, '', 56, 84, true)} alt="" />
          </span>
        )}
        <div className={styles.text}>
          <h1 className={`display ${styles.title}`}>{movie?.title ?? 'Your show'}</h1>
          <p className={styles.meta}>
            <span className={styles.when}>{formatShowDay(show.show_date)}, {formatShowTime(show.show_time)}</span>
            {movie?.language && <span>{movie.language}</span>}
            {movie?.certification && <span className={styles.cert}>{movie.certification}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
