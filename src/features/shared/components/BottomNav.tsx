'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Clapperboard, Ticket, Popcorn } from 'lucide-react';
import styles from './BottomNav.module.css';

// Phone-only tab bar. Hidden where the bottom of the screen belongs to
// something else: the booking bar on seats/checkout, and the staff tools.
const HIDDEN_PREFIXES = ['/counter', '/admin', '/login', '/reset-password'];

function isHidden(pathname: string) {
  if (HIDDEN_PREFIXES.some(p => pathname.startsWith(p))) return true;
  if (pathname.startsWith('/booking/')) {
    return !pathname.startsWith('/booking/confirmation') && !pathname.startsWith('/booking/lookup');
  }
  return false;
}

export default function BottomNav({ ticketsHref, ticketsLabel }: { ticketsHref: string; ticketsLabel: string }) {
  const pathname = usePathname();
  if (isHidden(pathname)) return null;

  const tabs = [
    { href: '/', label: 'Home', Icon: Home, active: pathname === '/' },
    { href: '/movies', label: 'Movies', Icon: Clapperboard, active: pathname.startsWith('/movies') },
    { href: ticketsHref, label: ticketsLabel, Icon: Ticket, active: pathname.startsWith('/account') || pathname.startsWith('/booking') },
    { href: '/menu', label: 'Food', Icon: Popcorn, active: pathname.startsWith('/menu') },
  ];

  return (
    <nav className={styles.bar} aria-label="Sections" data-bottom-bar>
      {tabs.map(({ href, label, Icon, active }) => (
        <Link key={label} href={href} className={styles.tab} aria-current={active ? 'page' : undefined}>
          <Icon aria-hidden className={styles.icon} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
