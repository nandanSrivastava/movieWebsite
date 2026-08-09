'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';

export default function Header() {
  const pathname = usePathname();
  const { user, signOut } = useCineBookAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = async () => {
    try { await signOut(); } catch (e) { console.error(e); }
  };

  const isActive = (p: string) => pathname === p;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .site-header {
          position: sticky;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          height: var(--header-height);
          display: flex;
          align-items: center;
          transition: all 0.3s ease;
        }
        .site-header.scrolled {
          background: rgba(5,5,7,0.85);
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .site-header.top {
          background: linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%);
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
          border: 1.5px solid var(--border-gold);
          box-shadow: 0 0 18px var(--gold-glow);
          flex-shrink: 0;
          transition: box-shadow 0.3s ease;
        }
        .hdr-logo:hover .hdr-logo-mark {
          box-shadow: 0 0 28px var(--gold-glow-strong);
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
        .hdr-logo-name {
          font-family: 'Playfair Display', serif;
          font-size: 1.25rem;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.01em;
        }
        .hdr-logo-name span {
          color: var(--gold-500);
        }
        .hdr-logo-sub {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
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
        .hdr-nav-link {
          font-size: 0.92rem;
          font-weight: 500;
          color: rgba(255,255,255,0.65);
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
          background: var(--gold-500);
          transition: width 0.25s ease;
          border-radius: 99px;
        }
        .hdr-nav-link:hover,
        .hdr-nav-link.active {
          color: #fff;
        }
        .hdr-nav-link:hover::after,
        .hdr-nav-link.active::after {
          width: 100%;
        }

        /* Right Actions */
        .hdr-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .hdr-user-pill {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 6px 6px 14px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 99px;
          transition: border-color 0.2s ease;
        }
        .hdr-user-pill:hover {
          border-color: rgba(255,255,255,0.16);
        }
        .hdr-role-badge {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 99px;
        }
        .hdr-role-admin {
          background: rgba(16,185,129,0.12);
          color: #34D399;
          border: 1px solid rgba(16,185,129,0.2);
        }
        .hdr-role-member {
          background: rgba(197,168,128,0.12);
          color: var(--gold-500);
          border: 1px solid rgba(197,168,128,0.2);
        }
        .hdr-role-user {
          background: rgba(96,165,250,0.12);
          color: #60A5FA;
          border: 1px solid rgba(96,165,250,0.2);
        }
        .hdr-signout {
          padding: 5px 14px;
          border-radius: 99px;
          background: rgba(255,255,255,0.06);
          border: none;
          color: rgba(255,255,255,0.6);
          font-size: 0.83rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .hdr-signout:hover {
          background: rgba(255,255,255,0.12);
          color: #fff;
        }
        .hdr-signin {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 5px 15px;
          border-radius: 99px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.25);
          color: rgba(255,255,255,0.85);
          font-size: 0.83rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        .hdr-signin:hover {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,255,255,0.55);
          color: #fff;
        }
      `}} />

      <header className={`site-header ${scrolled ? 'scrolled' : 'top'}`}>
        <div className="container hdr-inner">

          {/* Brand */}
          <Link href="/" className="hdr-logo">
            <div className="hdr-logo-mark">
              <img src="/logo.jpeg" alt="Dhrub Cineplex" />
            </div>
            <div className="hdr-logo-text">
              <span className="hdr-logo-name">Dhrub <span>Cineplex</span></span>
              <span className="hdr-logo-sub">Bagaha, Bihar</span>
            </div>
          </Link>

          {/* Nav — centred */}
          <nav className="hdr-nav">
            <Link href="/" className={`hdr-nav-link ${isActive('/') ? 'active' : ''}`}>
              Movies
            </Link>
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
    </>
  );
}
