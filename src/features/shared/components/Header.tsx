'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { useTheme } from 'next-themes';
import { User, LogOut, LogIn, Ticket, Sun, Moon, Search, Home, Menu, X } from 'lucide-react';

export default function Header() {
  const pathname = usePathname();
  const { user, signOut } = useCineBookAuth();
  const isHome = pathname === '/';
  const [scrolled, setScrolled] = useState(!isHome);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [currentUrl, setCurrentUrl] = useState('/login');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const search = window.location.search;
      if (path && path !== '/login') {
        setCurrentUrl(`/login?redirect=${encodeURIComponent(path + search)}`);
      } else {
        setCurrentUrl('/login');
      }
    }
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        .hdr-mobile-btn {
          display: none !important;
        }
        .hdr-actions {
          margin-left: auto;
        }
        @media (max-width: 850px) {
          .site-header {
            top: max(8px, env(safe-area-inset-top));
            width: calc(100% - 16px);
            height: 56px;
            border-radius: 16px;
            padding: 0 16px;
          }
          .hdr-nav {
            display: none !important;
          }
          .hdr-logo-name {
            font-size: 1.05rem;
          }
          .hdr-logo-sub {
            font-size: 0.52rem;
            letter-spacing: 0.1em;
          }
          .hdr-logo-mark {
            width: 32px !important;
            height: 32px !important;
          }
          .hdr-user-btn {
            width: 36px !important;
            height: 36px !important;
          }
          .hdr-mobile-btn {
            display: flex !important;
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

        /* Dropdown Styles */
        .hdr-user-dropdown-container {
          position: relative;
          display: inline-block;
        }
        .hdr-user-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.3s var(--ease-out-expo);
          box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }
        .hdr-user-btn:hover, .hdr-user-btn.active {
          background: var(--border-subtle);
          border-color: var(--border-strong);
          transform: scale(1.05);
          color: var(--gold-500);
        }
        .site-header.top .hdr-user-btn {
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.15);
          color: rgba(255,255,255,0.9);
        }
        .site-header.top .hdr-user-btn:hover, .site-header.top .hdr-user-btn.active {
          background: rgba(255,255,255,0.15);
          border-color: rgba(255,255,255,0.3);
          color: var(--gold-400);
        }
        .hdr-dropdown-menu {
          position: absolute;
          top: 56px;
          right: 0;
          width: 250px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: 16px;
          box-shadow: var(--shadow-lg), 0 10px 40px rgba(0,0,0,0.5);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transform-origin: top right;
          animation: dropdownFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 1100;
          backdrop-filter: blur(16px);
        }
        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(-8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .hdr-dropdown-header {
          padding: 8px 12px 12px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 6px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .hdr-dropdown-username {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .hdr-dropdown-role {
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--gold-500);
        }
        .hdr-dropdown-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 500;
          background: transparent;
          border: none;
          width: 100%;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .hdr-dropdown-item:hover {
          background: var(--border-subtle);
          color: var(--text-primary);
        }
        .hdr-dropdown-item svg {
          width: 18px;
          height: 18px;
          color: var(--text-secondary);
          transition: color 0.2s ease;
        }
        .hdr-dropdown-item:hover svg {
          color: var(--gold-500);
        }
        .hdr-dropdown-item.theme-toggle-row {
          justify-content: space-between;
          cursor: default;
        }
        .hdr-dropdown-item.theme-toggle-row:hover {
          background: transparent;
          color: var(--text-secondary);
        }
        .theme-toggle-label {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .theme-switch {
          position: relative;
          display: inline-block;
          width: 42px;
          height: 22px;
          cursor: pointer;
        }
        .theme-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .theme-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: var(--border-strong);
          transition: .3s;
          border-radius: 22px;
        }
        .theme-slider:before {
          position: absolute;
          content: "";
          height: 16px;
          width: 16px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .3s;
          border-radius: 50%;
        }
        input:checked + .theme-slider {
          background-color: var(--gold-500);
        }
        input:checked + .theme-slider:before {
          transform: translateX(20px);
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
                Dashboard
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
            <div className="hdr-user-dropdown-container" ref={dropdownRef}>
              <button 
                className={`hdr-user-btn ${dropdownOpen ? 'active' : ''}`}
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-label="Toggle Menu"
              >
                {dropdownOpen ? (
                  <X className="w-5 h-5" />
                ) : user ? (
                  <User className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>

              {dropdownOpen && (
                <div className="hdr-dropdown-menu">
                  {user ? (
                    <>
                      <div className="hdr-dropdown-header">
                        <span className="hdr-dropdown-username" title={user.full_name || user.email}>
                          {user.full_name || user.email}
                        </span>
                        <span className="hdr-dropdown-role">
                          {user.role}
                        </span>
                      </div>
                      <Link 
                        href="/" 
                        className="hdr-dropdown-item"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <Home className="w-4 h-4 text-gold-500" />
                        <span>Home / Movies</span>
                      </Link>
                      {user.role === 'admin' && (
                        <Link 
                          href="/admin/dashboard" 
                          className="hdr-dropdown-item"
                          onClick={() => setDropdownOpen(false)}
                        >
                          <Ticket className="w-4 h-4 text-gold-500" />
                          <span>Admin Dashboard</span>
                        </Link>
                      )}
                      {['admin', 'member'].includes(user.role) && (
                        <Link 
                          href="/counter" 
                          className="hdr-dropdown-item"
                          onClick={() => setDropdownOpen(false)}
                        >
                          <Ticket className="w-4 h-4 text-emerald-400" />
                          <span>Box Office POS</span>
                        </Link>
                      )}
                      <Link 
                        href="/account/bookings" 
                        className="hdr-dropdown-item"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <Ticket className="w-4 h-4" />
                        <span>My Tickets</span>
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link 
                        href="/" 
                        className="hdr-dropdown-item"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <Home className="w-4 h-4 text-gold-500" />
                        <span>Home / Movies</span>
                      </Link>
                      <Link 
                        href="/booking/lookup" 
                        className="hdr-dropdown-item"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <Search className="w-4 h-4" />
                        <span>Find My Ticket</span>
                      </Link>
                      <Link 
                        href={currentUrl} 
                        className="hdr-dropdown-item"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Sign In</span>
                      </Link>
                    </>
                  )}

                  <div className="hdr-dropdown-item theme-toggle-row">
                    <span className="theme-toggle-label">
                      {mounted && theme === 'dark' ? (
                        <>
                          <Moon className="w-4 h-4 text-gold-500" />
                          <span>Dark Mode</span>
                        </>
                      ) : (
                        <>
                          <Sun className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                          <span>Light Mode</span>
                        </>
                      )}
                    </span>
                    <label className="theme-switch">
                      <input 
                        type="checkbox" 
                        checked={mounted && theme === 'dark'} 
                        onChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                      />
                      <span className="theme-slider"></span>
                    </label>
                  </div>

                  {user && (
                    <button 
                      className="hdr-dropdown-item" 
                      onClick={() => {
                        handleLogout();
                        setDropdownOpen(false);
                      }}
                      style={{ borderTop: '1px solid var(--border-subtle)', borderRadius: '0 0 10px 10px', marginTop: '4px', paddingTop: '12px' }}
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </header>
      <style dangerouslySetInnerHTML={{ __html: `
        .header-spacer {
          height: 105px;
        }
        @media (max-width: 850px) {
          .header-spacer {
            height: 76px;
          }
        }
      `}} />
      {pathname !== '/' && <div className="header-spacer" />}
    </>
  );
}
