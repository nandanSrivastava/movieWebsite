import React from 'react';
import { formatINR } from '@/features/shared/utils/format';
import styles from './BookingSummaryCard.module.css';

interface BookingSummaryCardProps {
  selectedSeatLabels: string[];
  lineItems: { label: string; count: number; price: number }[];
  totalAmount: number;
}

// What the person is paying for, laid out like a receipt
export default function BookingSummaryCard({ selectedSeatLabels, lineItems, totalAmount }: BookingSummaryCardProps) {
  return (
    <section className={styles.card} aria-labelledby="summary-heading">
      <h2 id="summary-heading" className={styles.heading}>Order summary</h2>

      <div className={styles.seats}>
        <span className={styles.key}>Seats</span>
        <span className={styles.seatList}>{selectedSeatLabels.join(', ')}</span>
      </div>

      <dl className={styles.lines}>
        {lineItems.map(item => (
          <div key={item.label} className={styles.line}>
            <dt>{item.label} × {item.count} <span className={styles.each}>({formatINR(item.price)} each)</span></dt>
            <dd>{formatINR(item.price * item.count)}</dd>
          </div>
        ))}
        <div className={`${styles.line} ${styles.total}`}>
          <dt>Total</dt>
          <dd>{formatINR(totalAmount)}</dd>
        </div>
      </dl>
    </section>
  );
}
