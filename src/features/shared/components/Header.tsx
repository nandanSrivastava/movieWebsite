'use client';

import React, { useState, useEffect, useRef, useId } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { useTheme } from 'next-themes';
import { LogOut, LogIn, Ticket, Moon, Search, Menu, X, LayoutDashboard, ScanLine } from 'lucide-react';
import BottomNav from './BottomNav';
import styles from './Header.module.css';

export default function Header() {
  const pathname = usePathname();
  const { user, signOut } = useCineBookAuth();
  const isHome = pathname === '/';
  const [scrolled, setScrolled] = useState(!isHome);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [signInHref, setSignInHref] = useState('/login');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Send people back to where they were after signing in
  useEffect(() => {
    const path = window.location.pathname;
    const search = window.location.search;
    setSignInHref(path && path !== '/login' ? `/login?redirect=${encodeURIComponent(path + search)}` : '/login');
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isHome) {
      setScrolled(true);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  // Close on outside click and on Escape (focus goes back to the button)
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    try { await signOut(); } catch (e) { console.error(e); }
  };

  const current = (p: string) => (pathname === p || (p !== '/' && pathname.startsWith(p + '/')) ? 'page' : undefined);
  const isStaff = !!user && ['admin', 'member'].includes(user.role);
  const isDark = mounted ? resolvedTheme !== 'light' : true;
  const ticketsHref = user ? '/account/bookings' : '/booking/lookup';
  const initials = (user?.full_name || user?.email || '?')
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

  return (
    <>
      <header className={`${styles.header} ${scrolled ? '' : styles.overHero}`}>
        <div className={`container ${styles.inner}`}>
          <Link href="/" className={styles.brand} aria-label="Dhrub Cineplex, home">
            <span className={styles.brandMark}>
              <Image src="/logo.jpeg" alt="" width={36} height={36} priority />
            </span>
            <span className={styles.brandText}>
              <span className={styles.brandName}>Dhrub Cineplex</span>
              <span className={styles.brandPlace}>Bagaha, Bihar</span>
            </span>
          </Link>

          <nav className={styles.nav} aria-label="Main">
            <Link href="/movies" className={styles.navLink} aria-current={current('/movies')}>Movies</Link>
            <Link href="/menu" className={styles.navLink} aria-current={current('/menu')}>Food &amp; drinks</Link>
            <Link href={ticketsHref} className={styles.navLink} aria-current={current(ticketsHref)}>
              {user ? 'My tickets' : 'Find my ticket'}
            </Link>
            {user?.role === 'admin' && (
              <Link href="/admin/dashboard" className={`${styles.navLink} ${styles.navStaff}`} aria-current={current('/admin/dashboard')}>Dashboard</Link>
            )}
            {isStaff && (
              <Link href="/counter" className={`${styles.navLink} ${styles.navStaff}`} aria-current={current('/counter')}>Box office</Link>
            )}
          </nav>

          <div className={styles.actions}>
            {!user && (
              <Link href={signInHref} className={`btn btn-ghost btn-sm ${styles.signIn}`}>Sign in</Link>
            )}

            <div className={styles.menuWrap} ref={menuRef}>
              <button
                ref={buttonRef}
                type="button"
                className={styles.menuButton}
                onClick={() => setMenuOpen(open => !open)}
                aria-expanded={menuOpen}
                aria-controls={panelId}
                aria-label={user ? `Account menu for ${user.full_name || user.email}` : 'Menu'}
              >
                {menuOpen ? <X aria-hidden /> : user ? <span className={styles.initials}>{initials}</span> : <Menu aria-hidden />}
              </button>

              {menuOpen && (
                <div className={styles.panel} id={panelId}>
                  {user && (
                    <div className={styles.who}>
                      <span className={styles.whoName}>{user.full_name || user.email}</span>
                      <span className={styles.whoRole}>{user.role === 'user' ? 'Signed in' : user.role}</span>
                    </div>
                  )}

                  {user ? (
                    <Link href="/account/bookings" className={styles.item}><Ticket aria-hidden />My tickets</Link>
                  ) : (
                    <Link href="/booking/lookup" className={styles.item}><Search aria-hidden />Find my ticket</Link>
                  )}
                  {user?.role === 'admin' && (
                    <Link href="/admin/dashboard" className={styles.item}><LayoutDashboard aria-hidden />Admin dashboard</Link>
                  )}
                  {isStaff && (
                    <Link href="/counter" className={styles.item}><ScanLine aria-hidden />Box office</Link>
                  )}

                  <div className={styles.divider} />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isDark}
                    className={styles.item}
                    onClick={() => setTheme(isDark ? 'light' : 'dark')}
                  >
                    <Moon aria-hidden />Dark mode
                    <span className={styles.switch} aria-hidden />
                  </button>
                  <div className={styles.divider} />

                  {user ? (
                    <button type="button" className={styles.item} onClick={handleLogout}><LogOut aria-hidden />Sign out</button>
                  ) : (
                    <Link href={signInHref} className={styles.item}><LogIn aria-hidden />Sign in</Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      {!isHome && <div className={styles.spacer} aria-hidden />}
      <BottomNav ticketsHref={ticketsHref} ticketsLabel={user ? 'My tickets' : 'Tickets'} />
    </>
  );
}
