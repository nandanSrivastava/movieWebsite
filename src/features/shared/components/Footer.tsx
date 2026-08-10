import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .site-footer {
          background: var(--bg-void);
          border-top: 1px solid rgba(255,255,255,0.05);
          padding: 80px 0 40px;
          position: relative;
          overflow: hidden;
        }
        .site-footer::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(0, 162, 255, 0.5), transparent);
        }
        .footer-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr;
          gap: 64px;
          margin-bottom: 64px;
        }
        @media (max-width: 768px) {
          .footer-grid {
            grid-template-columns: 1fr;
            gap: 40px;
          }
        }
        .footer-brand-name {
          font-family: 'Playfair Display', serif;
          font-size: 1.5rem;
          font-weight: 700;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }
        .footer-brand-name img {
          width: 32px;
          height: 32px;
          border-radius: 7px;
          border: 1px solid rgba(0, 162, 255, 0.3);
          object-fit: cover;
        }
        .footer-brand-name span { color: var(--blue-500); }
        .footer-desc {
          font-size: 0.9rem;
          line-height: 1.75;
          color: rgba(255,255,255,0.35);
          max-width: 320px;
          margin-bottom: 28px;
        }
        .footer-social {
          display: flex;
          gap: 10px;
        }
        .footer-social-link {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.95rem;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        .footer-social-link:hover {
          background: rgba(0, 162, 255, 0.10);
          border-color: rgba(0, 162, 255, 0.30);
          transform: translateY(-2px);
        }
        .footer-col-title {
          font-family: 'Outfit', sans-serif;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
          margin-bottom: 20px;
        }
        .footer-links {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .footer-link {
          font-size: 0.9rem;
          color: rgba(255,255,255,0.55);
          text-decoration: none;
          transition: color 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .footer-link:hover { color: var(--blue-500); }
        .footer-link .link-icon {
          font-size: 0.85rem;
          width: 18px;
          flex-shrink: 0;
        }
        .footer-bottom {
          border-top: 1px solid rgba(255,255,255,0.05);
          padding-top: 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: gap;
          gap: 16px;
        }
        .footer-copy {
          font-size: 0.8rem;
          color: rgba(255,255,255,0.25);
        }
        .footer-copy span { color: rgba(255, 184, 0, 0.8); }
        .footer-legal {
          display: flex;
          gap: 24px;
        }
        .footer-legal a {
          font-size: 0.8rem;
          color: rgba(255,255,255,0.25);
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .footer-legal a:hover { color: rgba(255,255,255,0.55); }
      `}} />

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            {/* Brand Column */}
            <div>
              <div className="footer-brand-name">
                <img src="/logo.jpeg" alt="Dhrub Cineplex" />
                Dhrub <span>Cineplex</span>
              </div>
              <p className="footer-desc">
                Bagaha&apos;s premier destination for world-class cinema. Delivering premium entertainment experiences since day one — every frame, every seat, every moment.
              </p>
              <div className="footer-social">
                <a href="https://instagram.com/dhrubcineplex" target="_blank" rel="noreferrer" className="footer-social-link" title="Instagram">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ display: 'block' }}>
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                </a>
                <a href="tel:+919934060014" className="footer-social-link" title="Call us">
                  📞
                </a>
                <a href="mailto:dhrub.bagaha@gmail.com" className="footer-social-link" title="Email">
                  ✉️
                </a>
              </div>
            </div>

            {/* Contact Column */}
            <div>
              <h4 className="footer-col-title">Visit Us</h4>
              <div className="footer-links">
                <span className="footer-link">
                  <span className="link-icon">📍</span>
                  Dhrub Cineplex Complex, Bagaha, Bihar
                </span>
                <a href="tel:+919934060014" className="footer-link">
                  <span className="link-icon">📞</span>
                  +91 99340 60014
                </a>
                <a href="mailto:dhrub.bagaha@gmail.com" className="footer-link">
                  <span className="link-icon">✉️</span>
                  dhrub.bagaha@gmail.com
                </a>
                <a href="https://instagram.com/dhrubcineplex" target="_blank" rel="noreferrer" className="footer-link">
                  <span className="link-icon">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                    </svg>
                  </span>
                  @dhrubcineplex
                </a>
              </div>
            </div>

            {/* Partners Column */}
            <div>
              <h4 className="footer-col-title">Complex Partners</h4>
              <div className="footer-links">
                {[
                  { icon: '🍽️', name: 'Garden Café & Restaurant' },
                  { icon: '🛍️', name: 'Fashion World (Reliance)' },
                  { icon: '🛒', name: 'Sabarmal & Sons Grocery' },
                  { icon: '🎂', name: 'Cake Point Bakery' },
                ].map(p => (
                  <span key={p.name} className="footer-link">
                    <span className="link-icon">{p.icon}</span>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom row */}
          <div className="footer-bottom">
            <p className="footer-copy">
              © {new Date().getFullYear()} Dhrub Cineplex &amp; Dhrub Talkies.{' '}
              <span>Made with ♥ in Bagaha.</span>
            </p>
            <div className="footer-legal">
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Use</Link>
              <Link href="/refund">Refund Policy</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
