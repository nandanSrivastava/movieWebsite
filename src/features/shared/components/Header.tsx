'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { ThemeToggle } from '@/features/shared/components/ThemeToggle';

export default function Header() {
  const pathname = usePathname();
  const { user, signOut } = useCineBookAuth();
  const isHome = pathname === '/';
  const [scrolled, setScrolled] = useState(!isHome);

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

  const handleLogout = async () => {
    try { await signOut(); } catch (e) { console.error(e); }
  };

  const isActive = (p: string) => pathname === p;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .site-header {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          width: calc(100% - 48px);
          max-width: var(--max-width);
          z-index: 1000;
          height: 72px;
          display: flex;
          align-items: center;
          transition: transform 0.5s var(--ease-smooth), background-color 0.4s var(--ease-out-expo), border-color 0.4s var(--ease-out-expo), box-shadow 0.4s var(--ease-out-expo);
          border-radius: 24px;
          background: var(--bg-glass);
          backdrop-filter: blur(16px) saturate(180%);
          -webkit-backdrop-filter: blur(16px) saturate(180%);
          border: 1px solid var(--border-subtle);
          box-shadow: 0 4px 30px rgba(0,0,0,0.1);
        }
        @media (max-width: 768px) {
          .site-header {
            top: 12px;
            width: calc(100% - 24px);
            border-radius: 16px;
          }
        }
        .site-header.scrolled {
          background: var(--bg-elevated);
          border-color: var(--border-default);
          box-shadow: var(--shadow-md);
          transform: translateX(-50%) translateY(-12px);
          width: calc(100% - 24px);
        }
        .site-header.top {
          background: transparent;
          border-color: transparent;
          box-shadow: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }

        .hdr-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
        }

        /* Logo */
        .hdr-logo {
          display: flex;
          align-items: center;
          gap: 11px;
          text-decoration: none;
          flex-shrink: 0;
        }
        .hdr-logo-mark {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          overflow: hidden;
          border: 1.5px solid var(--border-strong);
          box-shadow: 0 0 18px var(--blue-glow);
          flex-shrink: 0;
          transition: box-shadow 0.3s ease;
        }
        .hdr-logo:hover .hdr-logo-mark {
          box-shadow: 0 0 28px var(--blue-glow-strong);
        }
        .hdr-logo-mark img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .hdr-logo-text {
          display: flex;
          flex-direction: column;
          line-height: 1;
        }
        .site-header.top .hdr-logo-name {
          color: #fff;
        }
        .hdr-logo-name {
          font-family: var(--font-playfair);
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }
        .hdr-logo-name span {
          color: var(--blue-500);
        }
        .hdr-logo-sub {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-secondary);
          margin-top: 1px;
        }

        /* Nav */
        .hdr-nav {
          display: flex;
          align-items: center;
          gap: 36px;
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
        }
        .site-header.top .hdr-nav-link {
          color: rgba(255,255,255,0.8);
        }
        .site-header.top .hdr-nav-link:hover,
        .site-header.top .hdr-nav-link.active {
          color: #fff;
        }
        .hdr-nav-link {
          font-size: 0.92rem;
          font-weight: 500;
          color: var(--text-secondary);
          text-decoration: none;
          letter-spacing: 0.01em;
          padding: 4px 0;
          position: relative;
          transition: color 0.2s ease;
        }
        .hdr-nav-link::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          width: 0;
          height: 1.5px;
          background: var(--blue-500);
          transition: width 0.25s ease;
          border-radius: 99px;
        }
        .hdr-nav-link:hover,
        .hdr-nav-link.active {
          color: var(--text-primary);
        }
        .hdr-nav-link:hover::after,
        .hdr-nav-link.active::after {
          width: 100%;
        }

        /* Right Actions */
        .hdr-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .site-header.top .hdr-user-pill {
          background: rgba(255,255,255,0.03);
          border-color: rgba(255,255,255,0.08);
        }
        .site-header.top .hdr-user-pill:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.15);
        }
        .hdr-user-pill {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 6px 8px 6px 16px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 100px;
          transition: all 0.3s var(--ease-out-expo);
        }
        .hdr-user-pill:hover {
          background: var(--border-subtle);
          border-color: var(--border-strong);
        }
        .hdr-role-badge {
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: capitalize;
          padding: 4px 12px;
          border-radius: 100px;
        }
        .hdr-role-admin {
          background: rgba(212, 175, 55, 0.15);
          color: var(--gold-400);
          border: 1px solid rgba(212, 175, 55, 0.3);
        }
        .hdr-role-member {
          background: rgba(96, 165, 250, 0.15);
          color: #93C5FD;
          border: 1px solid rgba(96, 165, 250, 0.3);
        }
        .hdr-role-user {
          background: var(--bg-surface);
          color: var(--text-primary);
          border: 1px solid var(--border-strong);
        }
        .site-header.top .hdr-signout {
          color: rgba(255,255,255,0.7);
        }
        .site-header.top .hdr-signout:hover {
          color: #fff;
        }
        .hdr-signout {
          padding: 6px 16px;
          border-radius: 100px;
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-secondary);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s var(--ease-snappy);
        }
        .hdr-signout:hover {
          background: var(--bg-surface);
          border-color: var(--border-strong);
          color: var(--text-primary);
        }
        .hdr-signin {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 20px;
          border-radius: 100px;
          background: var(--gold-500);
          color: #000;
          font-size: 0.85rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.3s var(--ease-spring);
          box-shadow: 0 4px 15px rgba(212, 175, 55, 0.2);
        }
        .hdr-signin:hover {
          background: var(--gold-400);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4);
        }
      `}} />

      <header className={`site-header ${scrolled ? 'scrolled' : 'top'}`}>
        <div className="container hdr-inner">

          {/* Brand */}
          <Link href="/" className="hdr-logo">
            <div className="hdr-logo-mark">
              <Image src="/logo.jpeg" alt="Dhrub Cineplex" width={38} height={38} priority loading="eager" />
            </div>
            <div className="hdr-logo-text">
              <span className="hdr-logo-name">Dhrub <span>Cineplex</span></span>
              <span className="hdr-logo-sub">Bagaha, Bihar</span>
            </div>
          </Link>

          {/* Nav — centred */}
          <nav className="hdr-nav">
            {user?.role === 'admin' && (
              <Link href="/admin/dashboard" className={`hdr-nav-link ${isActive('/admin/dashboard') ? 'active' : ''}`}>
                Command Center
              </Link>
            )}
            {user && ['admin', 'member'].includes(user.role) && (
              <Link href="/counter" className={`hdr-nav-link ${isActive('/counter') ? 'active' : ''}`}>
                Box Office
              </Link>
            )}
          </nav>

          {/* User area */}
          <div className="hdr-actions">
            <ThemeToggle />
            {user ? (
              <div className="hdr-user-pill">
                <span className={`hdr-role-badge ${
                  user.role === 'admin' ? 'hdr-role-admin'
                  : user.role === 'member' ? 'hdr-role-member'
                  : 'hdr-role-user'
                }`}>
                  {user.role}
                </span>
                <button className="hdr-signout" onClick={handleLogout}>
                  Sign out
                </button>
              </div>
            ) : (
              <Link href="/login" className="hdr-signin">
                Sign In
              </Link>
            )}
          </div>

        </div>
      </header>
      {pathname !== '/' && <div style={{ height: '110px' }} />}
    </>
  );
}
