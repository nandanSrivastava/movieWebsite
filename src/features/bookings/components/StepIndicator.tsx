import React from 'react';
import { Check } from 'lucide-react';
import styles from './StepIndicator.module.css';

const STEPS = ['Showtime', 'Seats', 'Pay', 'Ticket'] as const;
export type BookingStep = (typeof STEPS)[number];

export default function StepIndicator({ current }: { current: BookingStep }) {
  const currentIndex = STEPS.indexOf(current);
  return (
    <ol className={styles.steps} aria-label={`Booking progress: step ${currentIndex + 1} of ${STEPS.length}, ${current}`}>
      {STEPS.map((step, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo';
        return (
          <li key={step} className={`${styles.step} ${styles[state]}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className={styles.dot} aria-hidden>
              {state === 'done' ? <Check /> : i + 1}
            </span>
            <span className={styles.label}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
