import React from 'react';
import { formatINR } from '@/features/shared/utils/format';
import seat from './SeatingGrid.module.css';
import styles from './SeatingLegend.module.css';

// Uses the same seat styles as the map, so the key always matches what's drawn
export default function SeatingLegend({ classicPrice, premiumPrice, hasPremium }: {
  classicPrice: number;
  premiumPrice: number;
  hasPremium: boolean;
}) {
  const items = [
    { cls: '', label: `Classic ${formatINR(classicPrice)}` },
    ...(hasPremium ? [{ cls: seat.premium, label: `Premium ${formatINR(premiumPrice)}` }] : []),
    { cls: seat.selected, label: 'Your pick' },
    { cls: seat.held, label: 'On hold' },
    { cls: seat.sold, label: 'Sold' },
  ];

  return (
    <ul className={styles.legend} aria-label="Seat key">
      {items.map(item => (
        <li key={item.label} className={styles.item}>
          <span className={`${seat.seat} ${item.cls} ${styles.swatch}`} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
