'use client';

import React, { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function MovieCarousel({ movies }: { movies: any[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isHovered) return;

    const intervalId = setInterval(() => {
      if (scrollRef.current) {
        const { current } = scrollRef;
        const scrollAmount = current.clientWidth * 0.8;
        // If we've reached the end, scroll back to start
        if (current.scrollLeft + current.clientWidth >= current.scrollWidth - 10) {
          current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
      }
    }, 4000);

    return () => clearInterval(intervalId);
  }, [isHovered]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { current } = scrollRef;
      const scrollAmount = current.clientWidth * 0.8;
      current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div 
      style={{ position: 'relative' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button 
        onClick={() => scroll('left')}
        style={{
          position: 'absolute',
          left: '10px',
          top: '40%',
          transform: 'translateY(-50%)',
          zIndex: 10,
          background: 'rgba(0,0,0,0.5)',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          backdropFilter: 'blur(4px)'
        }}
      >
        ←
      </button>

      <div className="rail-track" ref={scrollRef}>
        {movies.map((movie) => (
          <Link key={movie.id} href={`/movies/${movie.id}`} className="premium-poster">
            <div className="poster-image-wrap">
              <Image src={movie.poster_url} alt={movie.title} fill sizes="(max-width: 768px) 100vw, 33vw" style={{ objectFit: 'cover' }} />
              <div className="poster-overlay">
                <span className="book-now-badge">Book Tickets</span>
              </div>
            </div>
            <div className="poster-info">
              <h3 className="poster-title">{movie.title}</h3>
              <div className="poster-meta">
                <span className="poster-cert">{movie.certification}</span>
                <span>{movie.genre?.split(',')[0]?.trim()}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <button 
        onClick={() => scroll('right')}
        style={{
          position: 'absolute',
          right: '10px',
          top: '40%',
          transform: 'translateY(-50%)',
          zIndex: 10,
          background: 'rgba(0,0,0,0.5)',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          backdropFilter: 'blur(4px)'
        }}
      >
        →
      </button>
    </div>
  );
}
