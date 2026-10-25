import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Phone, Mail, UtensilsCrossed, ShoppingBag, ShoppingCart, CakeSlice } from 'lucide-react';
import styles from './Footer.module.css';

// lucide no longer ships brand marks, so the Instagram glyph stays inline
function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

const PARTNERS = [
  { Icon: UtensilsCrossed, name: 'Garden Café & Restaurant' },
  { Icon: ShoppingBag, name: 'Fashion World (Reliance)' },
  { Icon: ShoppingCart, name: 'Sabarmal & Sons Grocery' },
  { Icon: CakeSlice, name: 'Cake Point Bakery' },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.grid}>
          <div>
            <div className={styles.brand}>
              <Image src="/logo.jpeg" alt="" width={36} height={36} />
              Dhrub Cineplex
            </div>
            <p className={styles.desc}>
              Bagaha&apos;s premier destination for world-class cinema. Delivering premium entertainment experiences since day one — every frame, every seat, every moment.
            </p>
            <div className={styles.social}>
              <a href="https://instagram.com/dhrubcineplex" target="_blank" rel="noreferrer" className={styles.socialLink} aria-label="Instagram">
                <InstagramIcon />
              </a>
              <a href="tel:+919934060014" className={styles.socialLink} aria-label="Call us">
                <Phone aria-hidden />
              </a>
              <a href="mailto:dhrub.bagaha@gmail.com" className={styles.socialLink} aria-label="Email us">
                <Mail aria-hidden />
              </a>
            </div>
          </div>

          <div>
            <h2 className={styles.colTitle}>Contact</h2>
            <div className={styles.list}>
              <span className={styles.row}><MapPin aria-hidden />Dhrub Cineplex Complex, Bagaha, Bihar</span>
              <a href="tel:+919934060014" className={styles.row}><Phone aria-hidden />+91 99340 60014</a>
              <a href="mailto:dhrub.bagaha@gmail.com" className={styles.row}><Mail aria-hidden />dhrub.bagaha@gmail.com</a>
              <a href="https://instagram.com/dhrubcineplex" target="_blank" rel="noreferrer" className={styles.row}><InstagramIcon />@dhrubcineplex</a>
            </div>
          </div>

          <div>
            <h2 className={styles.colTitle}>In the complex</h2>
            <div className={styles.list}>
              {PARTNERS.map(({ Icon, name }) => (
                <span key={name} className={styles.row}><Icon aria-hidden />{name}</span>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copy}>
            © {new Date().getFullYear()} Dhrub Cineplex &amp; Dhrub Talkies. Made with ♥ in Bagaha.
          </p>
          <nav className={styles.legal} aria-label="Legal">
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of use</Link>
            <Link href="/refund">Refund policy</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
