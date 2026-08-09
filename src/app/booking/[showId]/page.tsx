import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import SeatingMapClient from '@/features/bookings/components/SeatingMapClient';

interface PageProps {
  params: Promise<{ showId: string }>;
}

export default async function BookingPage({ params }: PageProps) {
  const { showId } = await params;
  
  // Fetch show details
  const show = await db.getShowById(showId);
  if (!show) {
    notFound();
  }

  // Fetch initial seat configuration
  const initialSeats = await db.getSeatsForShow(showId);

  // Helper to format time (e.g. "14:00:00" to "02:00 PM")
  const formatTimeLabel = (timeStr: string) => {
    try {
      const [hours, minutes] = timeStr.split(':');
      const h = parseInt(hours);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 || 12;
      return `${displayH.toString().padStart(2, '0')}:${minutes} ${ampm}`;
    } catch {
      return timeStr;
    }
  };

  const formatDateLabel = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      return date.toLocaleDateString('en-US', options);
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <Header />
      <main style={{ 
        backgroundColor: 'var(--bg-void)', 
        color: '#FFFFFF', 
        minHeight: 'calc(100vh - 180px)', 
        padding: '40px 20px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Backdrop Glow */}
        <div style={{
          position: 'absolute',
          top: '5%',
          left: '25%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(197, 168, 128, 0.03) 0%, transparent 70%)',
          filter: 'blur(100px)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          
          {/* Back button link */}
          <Link href={`/movies/${show.movie_id}`} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85rem',
            color: '#9CA3AF',
            marginBottom: '20px',
            transition: 'color 0.2s ease',
            textDecoration: 'none'
          }}>
            ← Back to Movie Info
          </Link>

          {/* Header Metadata Glassmorphic Ribbon */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '20px',
            background: 'linear-gradient(135deg, rgba(18, 18, 24, 0.8) 0%, rgba(11, 11, 14, 0.95) 100%)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--border-subtle)',
            padding: '24px 28px',
            borderRadius: '16px',
            marginBottom: '40px',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              {/* Mini Poster Thumbnail */}
              {show.movie?.poster_url && (
                <img 
                  src={show.movie.poster_url} 
                  alt={show.movie.title} 
                  style={{
                    width: '50px',
                    height: '75px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
                  }}
                />
              )}
              <div>
                <span style={{ 
                  fontSize: '0.75rem', 
                  color: 'var(--highlight-gold)', 
                  fontWeight: 800, 
                  textTransform: 'uppercase', 
                  letterSpacing: '1.5px',
                  backgroundColor: 'rgba(197, 168, 128, 0.1)',
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}>
                  SEAT SELECTION
                </span>
                <h1 style={{ 
                  fontSize: '1.9rem', 
                  fontWeight: 800, 
                  marginTop: '8px', 
                  fontFamily: 'var(--font-family-heading)',
                  color: '#FFFFFF'
                }}>
                  {show.movie?.title}
                </h1>
              </div>
            </div>
            
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--highlight-gold)' }}>
                {show.screen?.name}
              </p>
              <p style={{ color: '#E5E7EB', fontSize: '0.95rem', marginTop: '4px', fontWeight: 500 }}>
                📅 {formatDateLabel(show.show_date)}
              </p>
              <p style={{ color: '#9CA3AF', fontSize: '0.9rem', marginTop: '2px' }}>
                🕒 {formatTimeLabel(show.show_time)}
              </p>
            </div>
          </div>

          {/* Interactive Seat grid */}
          <SeatingMapClient show={show} initialSeats={initialSeats} />

        </div>
      </main>
      <Footer />
    </>
  );
}
