'use client';

import React, { useRef, useEffect, useState } from 'react';
import Image from 'next/image';

interface UpcomingMovie {
  title: string;
  date: string;
  poster: string;
}

export default function UpcomingCarousel({ movies }: { movies: UpcomingMovie[] }) {
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
        className="hidden sm:flex"
        style={{
          position: 'absolute',
          left: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10,
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          cursor: 'pointer',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          backdropFilter: 'blur(4px)'
        }}
      >
        ←
      </button>

      <div className="rail-track" ref={scrollRef}>
        {movies.map((movie, i) => (
          <div key={i} className="upcoming-card">
            <Image 
              src={movie.poster} 
              alt={movie.title} 
              fill 
              sizes="(max-width: 768px) 100vw, 33vw" 
              style={{ objectFit: 'cover' }} 
            />
            <div className="upcoming-info">
              <span className="upcoming-date">{movie.date}</span>
              <h3 className="upcoming-title">{movie.title}</h3>
            </div>
          </div>
        ))}
      </div>

      <button 
        onClick={() => scroll('right')}
        className="hidden sm:flex"
        style={{
          position: 'absolute',
          right: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10,
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          cursor: 'pointer',
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
