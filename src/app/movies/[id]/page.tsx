import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import ShowtimePanel from '@/features/movies/components/ShowtimePanel';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MovieDetailsPage({ params }: PageProps) {
  const { id } = await params;
  
  // Fetch movie details and scheduling
  const movie = await db.getMovieById(id);
  if (!movie) {
    notFound();
  }

  const shows = await db.getShowsForMovie(id);

  return (
    <>
      <Header />
      <main style={{ 
        backgroundColor: '#070709', 
        color: '#FFFFFF', 
        minHeight: 'calc(100vh - 180px)', 
        padding: '0 0 60px 0',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Backdrop Glow Bubbles */}
        <div style={{
          position: 'absolute',
          top: '0px',
          left: '15%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(229, 9, 20, 0.06) 0%, transparent 70%)',
          filter: 'blur(100px)',
          pointerEvents: 'none',
          zIndex: 0
        }} />
        <div style={{
          position: 'absolute',
          top: '30%',
          right: '10%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(212, 175, 55, 0.04) 0%, transparent 70%)',
          filter: 'blur(100px)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        {/* Cinematic Backdrop Banner */}
        <section style={{
          position: 'relative',
          padding: '60px 0',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          zIndex: 1
        }}>
          {/* Blur Background wallpaper blend */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: -1,
            overflow: 'hidden'
          }}>
            {movie.poster_url && (
              <img 
                src={movie.poster_url} 
                alt={movie.title}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: 0.08,
                  filter: 'blur(12px) scale(1.1)'
                }}
              />
            )}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(to top, #070709 0%, rgba(7, 7, 9, 0.9) 100%)'
            }} />
          </div>

          <div className="container">
            <Link href="/" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#9CA3AF',
              fontSize: '0.85rem',
              textDecoration: 'none',
              marginBottom: '32px',
              transition: 'color 0.2s ease'
            }}>
              ← Back to All Movies
            </Link>

            <div style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '48px',
              alignItems: 'flex-start',
              flexWrap: 'wrap'
            }}>
              {/* Movie Poster Card */}
              <div style={{
                flex: '1 1 300px',
                maxWidth: '300px',
                margin: '0 auto'
              }}>
                <div style={{
                  borderRadius: '16px',
                  overflow: 'hidden',
                  border: '1.5px solid rgba(212, 175, 55, 0.4)',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7), 0 0 20px rgba(212, 175, 55, 0.15)',
                  aspectRatio: '2/3',
                  backgroundColor: '#0F121C'
                }}>
                  <img 
                    src={movie.poster_url} 
                    alt={movie.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              </div>

              {/* Movie Details Column */}
              <div style={{ flex: '1 1 500px', maxWidth: '750px' }}>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: 'var(--highlight-gold)',
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                  backgroundColor: 'rgba(212, 175, 55, 0.1)',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  border: '1px solid rgba(212, 175, 55, 0.2)'
                }}>
                  ★ NOW PLAYING AT DHRUB CINEPLEX
                </span>

                <h1 style={{
                  fontSize: '3.2rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-family-heading)',
                  letterSpacing: '-1.5px',
                  marginTop: '16px',
                  lineHeight: 1.1,
                  color: '#FFFFFF'
                }}>
                  {movie.title}
                </h1>

                {/* Meta details */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                  marginTop: '16px',
                  marginBottom: '28px',
                  fontSize: '0.85rem',
                  flexWrap: 'wrap'
                }}>
                  <span style={{
                    padding: '3px 10px',
                    backgroundColor: 'rgba(229, 9, 20, 0.15)',
                    color: '#FF6B6B',
                    border: '1px solid rgba(229, 9, 20, 0.3)',
                    borderRadius: '4px',
                    fontWeight: 700
                  }}>
                    {movie.certification}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <span style={{ color: '#E5E7EB', fontWeight: 500 }}>
                    🕒 {movie.duration_minutes} Mins
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <span style={{ color: '#E5E7EB', fontWeight: 500 }}>
                    🎭 {movie.genre}
                  </span>
                  {movie.language && (
                    <>
                      <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                      <span style={{ color: 'var(--highlight-gold)', fontWeight: 600 }}>
                        🗣️ {movie.language}
                      </span>
                    </>
                  )}
                </div>

                <div style={{
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  padding: '24px',
                  borderRadius: '12px',
                  marginBottom: '32px'
                }}>
                  <h3 style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    color: 'var(--highlight-gold)',
                    marginBottom: '10px'
                  }}>
                    Synopsis
                  </h3>
                  <p style={{
                    fontSize: '1.05rem',
                    lineHeight: 1.65,
                    color: '#C8CAD0'
                  }}>
                    {movie.synopsis}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Showtimes & Selector Section */}
        <section className="container" style={{ position: 'relative', zIndex: 2, marginTop: '40px' }}>
          <ShowtimePanel shows={shows} />
        </section>

        {/* Video Trailer Section */}
        {movie.trailer_url && (
          <section className="container" style={{ position: 'relative', zIndex: 2, marginTop: '60px' }}>
            <h3 style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              marginBottom: '20px',
              fontFamily: 'var(--font-family-heading)',
              color: '#FFFFFF'
            }}>
              Official Movie Trailer
            </h3>
            <div style={{
              position: 'relative',
              width: '100%',
              maxWidth: '850px',
              borderRadius: '16px',
              overflow: 'hidden',
              backgroundColor: '#000000',
              border: '1px solid rgba(212, 175, 55, 0.25)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
            }}>
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                <iframe 
                  src={movie.trailer_url}
                  title={`${movie.title} Trailer`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    border: 0
                  }}
                />
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
