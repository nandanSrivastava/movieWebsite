import React from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, Clock, Info } from 'lucide-react';
import styles from './StatusMessage.module.css';

type Tone = 'success' | 'danger' | 'urgent' | 'info';
const ICONS = { success: CheckCircle2, danger: AlertCircle, urgent: Clock, info: Info };

// Full-page message for dead ends: says what happened and what to do next
export default function StatusMessage({ tone, title, body, actions = [], children, as: Tag = 'main' }: {
  tone: Tone;
  title: string;
  body?: React.ReactNode;
  actions?: { href: string; label: string; primary?: boolean }[];
  children?: React.ReactNode;
  as?: 'main' | 'div';
}) {
  const Icon = ICONS[tone];
  return (
    <Tag className={`container ${styles.wrap}`}>
      <div className={styles.inner}>
        <span className={`${styles.icon} ${styles[tone]}`} aria-hidden><Icon /></span>
        <h1 className={styles.title}>{title}</h1>
        {body && <p className={styles.body}>{body}</p>}
        {children}
        {actions.length > 0 && (
          <div className={styles.actions}>
            {actions.map(a => (
              <Link key={a.href + a.label} href={a.href} className={`btn ${a.primary ? 'btn-primary' : 'btn-ghost'}`}>{a.label}</Link>
            ))}
          </div>
        )}
      </div>
    </Tag>
  );
}
