'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import { useToast } from '@/features/shared/context/ToastContext';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { isMockMode } from '@/lib/config';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminStore } from '@/features/admin/store/adminStore';

const getAuthHeaders = async (customHeaders: Record<string, string> = {}) => {
  const headers: Record<string, string> = { ...customHeaders };
  if (!isMockMode) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }
  return headers;
};

const fetchDashboardData = async () => {
  const authHdrs = await getAuthHeaders();

  const [locksRes, logsRes, showsRes, moviesRes, screensRes] = await Promise.all([
    fetch('/api/admin/active-locks', { headers: authHdrs }),
    fetch('/api/admin/audit-logs', { headers: authHdrs }),
    fetch('/api/shows'),
    fetch('/api/admin/movies', { headers: authHdrs }),
    fetch('/api/screens')
  ]);

  const [locksData, logsData, showsData, moviesData, screensData] = await Promise.all([
    locksRes.json().catch(() => ({})),
    logsRes.json().catch(() => ({})),
    showsRes.json().catch(() => ({})),
    moviesRes.ok ? moviesRes.json().catch(() => ({})) : { movies: [] },
    screensRes.ok ? screensRes.json().catch(() => ({})) : { screens: [] }
  ]);

  return {
    activeLocks: locksData.activeLocks || [],
    auditLogs: logsData.logs || [],
    shows: showsData.shows || [],
    moviesList: moviesData.movies || [],
    screensList: screensData.screens || []
  };
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useCineBookAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [actioning, setActioning] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Zustand Store States
  const {
    movieTitle, movieSynopsis, movieGenre, movieLanguage, movieDuration, movieCertification, moviePoster, movieTrailer, movieIsFeatured, movieSubmitting,
    setMovieField, resetMovieForm, setMovieSubmitting,
    scheduleMovieId, scheduleScreenId, scheduleDate, scheduleTime, priceNormal, pricePremium, priceRecliner, scheduleSubmitting,
    setScheduleField, resetScheduleForm, setScheduleSubmitting
  } = useAdminStore();

  // React Query for dashboard data
  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: fetchDashboardData,
    enabled: !!user && user.role === 'admin',
    refetchInterval: 6000,
    staleTime: 5000,
  });

  const activeLocks = data?.activeLocks || [];
  const auditLogs = data?.auditLogs || [];
  const shows = data?.shows || [];
  const moviesList = data?.moviesList || [];
  const screensList = data?.screensList || [];

  // Handle Create Movie Submission
  const handleCreateMovie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movieTitle) {
      showToast('Movie title is required.', 'error');
      return;
    }
    setMovieSubmitting(true);
    try {
      const res = await fetch('/api/admin/movies', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          title: movieTitle,
          synopsis: movieSynopsis,
          genre: movieGenre,
          language: movieLanguage,
          duration_minutes: movieDuration,
          certification: movieCertification,
          poster_url: moviePoster,
          trailer_url: movieTrailer,
          is_featured: movieIsFeatured
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to list movie.');

      showToast(`Successfully listed movie: "${movieTitle}"`, 'success');
      resetMovieForm();
      queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
    } catch (err: any) {
      showToast(err.message || 'Failed to list movie.', 'error');
    } finally {
      setMovieSubmitting(false);
    }
  };

  // Handle Schedule Showtime Submission
  const handleCreateShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleMovieId || !scheduleScreenId || !scheduleDate || !scheduleTime) {
      showToast('Please fill all required showtime fields.', 'error');
      return;
    }
    setScheduleSubmitting(true);
    try {
      const res = await fetch('/api/shows', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          movie_id: scheduleMovieId,
          screen_id: scheduleScreenId,
          show_date: scheduleDate,
          show_time: scheduleTime + ':00', // format as HH:MM:SS
          price_normal: priceNormal,
          price_premium: pricePremium,
          price_recliner: priceRecliner
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to schedule showtime.');

      showToast('Successfully scheduled showtime!', 'success');
      resetScheduleForm();
      queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
    } catch (err: any) {
      showToast(err.message || 'Failed to schedule showtime.', 'error');
    } finally {
      setScheduleSubmitting(false);
    }
  };

  // Wait for auth to finish loading, mark as initialized, THEN redirect if not admin.
  useEffect(() => {
    if (authLoading) return;
    setInitialized(true);
    if (!user || user.role !== 'admin') {
      router.replace('/login?error=unauthorized');
    }
  }, [user, authLoading, router]);

  // Handle Manual Seat Unlock Override
  const handleForceReleaseHold = async (showId: string, seatLayoutId: string, seatLabel: string) => {
    if (!confirm(`Are you sure you want to force-release the hold on seat ${seatLabel}?`)) return;
    
    setActioning(seatLayoutId);
    try {
      const res = await fetch('/api/seats/unlock', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          showId,
          seatLayoutIds: [seatLayoutId]
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to release seat hold.');
      }

      showToast(`Seat hold ${seatLabel} successfully released.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error releasing lock.', 'error');
    } finally {
      setActioning(null);
    }
  };

  // Helper date/time formatters
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

  // Calculations
  const totalPaidRevenue = auditLogs
    .filter((log: any) => log.action === 'PAYMENT_CAPTURE_SUCCESS' || log.action === 'BOOKING_CONFIRM_CASH_POS')
    .reduce((acc: number, log: any) => {
      const amt = log.details?.amount || log.details?.totalAmount || 0;
      return acc + Number(amt);
    }, 0);

  const totalTicketsSold = shows.reduce((acc: number, show: any) => acc + (show.bookedSeats || 0), 0);

  if (!initialized || loading || authLoading || !user || user.role !== 'admin') {
    return (
      <>
        <Header />
        <div style={{ display: 'flex', minHeight: '80vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', color: '#FFFFFF' }}>
          <h3>Loading administrative dashboard telemetry...</h3>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main style={{ backgroundColor: 'var(--bg-primary)', color: '#FFFFFF', minHeight: 'calc(100vh - 180px)', padding: '40px 20px' }}>
        <div className="container">
          
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px', fontFamily: 'var(--font-family-heading)' }}>
            Admin Dashboard
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '32px' }}>
            Live theater audit logs, active seats locks, and ticket occupancy indicators.
          </p>

          {/* 1. STATS METRICS RIBBON */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '20px',
            marginBottom: '40px'
          }}>
            <div className="card" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '24px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Revenue</span>
              <h3 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--highlight-gold)', marginTop: '8px' }}>₹{totalPaidRevenue}</h3>
            </div>
            <div className="card" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '24px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Tickets Confirmed</span>
              <h3 style={{ fontSize: '2rem', fontWeight: 800, color: '#FFFFFF', marginTop: '8px' }}>{totalTicketsSold} sold</h3>
            </div>
            <div className="card" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '24px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active Seat Holds</span>
              <h3 style={{ fontSize: '2rem', fontWeight: 800, color: '#F59E0B', marginTop: '8px' }}>{activeLocks.length} locked</h3>
            </div>
          </div>

          {/* 2. ADMIN ACTIONS: MOVIE & SHOWTIME MANAGEMENT */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: '30px',
            marginBottom: '45px'
          }}>
            {/* ADD MOVIE FORM CARD */}
            <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', padding: '28px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '22px', fontFamily: 'var(--font-family-heading)', color: 'var(--highlight-gold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🎬 Add New Movie
              </h3>
              
              <form onSubmit={handleCreateMovie} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Movie Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Gladiator II"
                    value={movieTitle}
                    onChange={(e) => setMovieField('movieTitle', e.target.value)}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '0.9rem',
                      color: '#FFFFFF',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--highlight-gold)'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Synopsis</label>
                  <textarea
                    rows={2}
                    placeholder="Brief description of the movie..."
                    value={movieSynopsis}
                    onChange={(e) => setMovieField('movieSynopsis', e.target.value)}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '0.9rem',
                      color: '#FFFFFF',
                      outline: 'none',
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--highlight-gold)'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Genre</label>
                    <input
                      type="text"
                      placeholder="Action, Sci-Fi"
                      value={movieGenre}
                      onChange={(e) => setMovieField('movieGenre', e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '0.9rem',
                        color: '#FFFFFF',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Language</label>
                    <input
                      type="text"
                      placeholder="Hindi"
                      value={movieLanguage}
                      onChange={(e) => setMovieField('movieLanguage', e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '0.9rem',
                        color: '#FFFFFF',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Duration (mins)</label>
                    <input
                      type="number"
                      placeholder="120"
                      value={movieDuration}
                      onChange={(e) => setMovieField('movieDuration', e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '0.9rem',
                        color: '#FFFFFF',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Certification</label>
                    <select
                      value={movieCertification}
                      onChange={(e) => setMovieField('movieCertification', e.target.value)}
                      style={{
                        background: '#1F1F27',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '0.9rem',
                        color: '#FFFFFF',
                        outline: 'none'
                      }}
                    >
                      <option value="U">U (Family)</option>
                      <option value="UA">UA (Unrestricted Public)</option>
                      <option value="A">A (Adults Only)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Poster URL</label>
                  <input
                    type="url"
                    placeholder="https://upload.wikimedia.org/wikipedia/en/..."
                    value={moviePoster}
                    onChange={(e) => setMovieField('moviePoster', e.target.value)}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '0.9rem',
                      color: '#FFFFFF',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Trailer Embed URL</label>
                  <input
                    type="url"
                    placeholder="https://www.youtube.com/embed/..."
                    value={movieTrailer}
                    onChange={(e) => setMovieField('movieTrailer', e.target.value)}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '0.9rem',
                      color: '#FFFFFF',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    id="isFeaturedMovie"
                    checked={movieIsFeatured}
                    onChange={(e) => setMovieField('movieIsFeatured', e.target.checked)}
                    style={{
                      width: '18px',
                      height: '18px',
                      accentColor: 'var(--highlight-gold)',
                      cursor: 'pointer'
                    }}
                  />
                  <label htmlFor="isFeaturedMovie" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    Feature this movie in the Hero Carousel
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={movieSubmitting}
                  style={{
                    background: 'linear-gradient(135deg, #D4AF37 0%, #E5C158 100%)',
                    color: '#08080F',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    marginTop: '8px',
                    boxShadow: '0 4px 12px rgba(212,175,55,0.2)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  {movieSubmitting ? 'Listing Movie...' : 'List Movie'}
                </button>
              </form>
            </div>

            {/* SCHEDULE SHOWTIME FORM CARD */}
            <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-tertiary)', padding: '28px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '22px', fontFamily: 'var(--font-family-heading)', color: 'var(--highlight-gold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⏰ Schedule New Showtime
              </h3>
              
              <form onSubmit={handleCreateShow} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Select Movie *</label>
                  <select
                    required
                    value={scheduleMovieId}
                    onChange={(e) => setScheduleField('scheduleMovieId', e.target.value)}
                    style={{
                      background: '#1F1F27',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '0.9rem',
                      color: '#FFFFFF',
                      outline: 'none'
                    }}
                  >
                    <option value="">-- Choose Movie --</option>
                    {moviesList.map((movie: any) => (
                      <option key={movie.id} value={movie.id}>{movie.title}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Select Screen *</label>
                  <select
                    required
                    value={scheduleScreenId}
                    onChange={(e) => setScheduleField('scheduleScreenId', e.target.value)}
                    style={{
                      background: '#1F1F27',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '0.9rem',
                      color: '#FFFFFF',
                      outline: 'none'
                    }}
                  >
                    <option value="">-- Choose Screen --</option>
                    {screensList.map((screen: any) => (
                      <option key={screen.id} value={screen.id}>{screen.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Show Date *</label>
                    <input
                      type="date"
                      required
                      value={scheduleDate}
                      onChange={(e) => setScheduleField('scheduleDate', e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        padding: '9px 12px',
                        fontSize: '0.9rem',
                        color: '#FFFFFF',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Show Time *</label>
                    <input
                      type="time"
                      required
                      value={scheduleTime}
                      onChange={(e) => setScheduleField('scheduleTime', e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        padding: '9px 12px',
                        fontSize: '0.9rem',
                        color: '#FFFFFF',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--highlight-gold)', marginTop: '4px' }}>
                  🎟️ Seat Category Pricing (INR)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Normal Price</label>
                    <input
                      type="number"
                      required
                      value={priceNormal}
                      onChange={(e) => setScheduleField('priceNormal', e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        padding: '10px',
                        fontSize: '0.9rem',
                        color: '#FFFFFF',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Premium Price</label>
                    <input
                      type="number"
                      required
                      value={pricePremium}
                      onChange={(e) => setScheduleField('pricePremium', e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        padding: '10px',
                        fontSize: '0.9rem',
                        color: '#FFFFFF',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Recliner Price</label>
                    <input
                      type="number"
                      required
                      value={priceRecliner}
                      onChange={(e) => setScheduleField('priceRecliner', e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        padding: '10px',
                        fontSize: '0.9rem',
                        color: '#FFFFFF',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={scheduleSubmitting}
                  style={{
                    background: 'linear-gradient(135deg, #D4AF37 0%, #E5C158 100%)',
                    color: '#08080F',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    marginTop: '20px',
                    boxShadow: '0 4px 12px rgba(212,175,55,0.2)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  {scheduleSubmitting ? 'Scheduling...' : 'Schedule Showtime'}
                </button>
              </form>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '30px'
          }}>
            
            {/* ROW 1: ACTIVE SEAT HOLDS OVERRIDE */}
            <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', fontFamily: 'var(--font-family-heading)' }}>
                ⏳ Active Seat Holds & Locks
              </h3>

              {activeLocks.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No active temporary seat holds currently running.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '12px' }}>Movie</th>
                        <th style={{ padding: '12px' }}>Screen</th>
                        <th style={{ padding: '12px' }}>Seat</th>
                        <th style={{ padding: '12px' }}>Expires In</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeLocks.map((lock: any) => {
                        const timeLeft = Math.max(0, Math.round((new Date(lock.expiresAt).getTime() - Date.now()) / 1000));
                        const mins = Math.floor(timeLeft / 60);
                        const secs = timeLeft % 60;
                        return (
                          <tr key={lock.seatId} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                            <td style={{ padding: '12px', fontWeight: 600 }}>{lock.movieTitle}</td>
                            <td style={{ padding: '12px' }}>{lock.screenName}</td>
                            <td style={{ padding: '12px', color: 'var(--accent-crimson)', fontWeight: 'bold' }}>{lock.seatLabel}</td>
                            <td style={{ padding: '12px', color: '#F59E0B' }}>{mins}:{secs.toString().padStart(2, '0')}</td>
                            <td style={{ padding: '12px', textAlign: 'right' }}>
                              <button
                                onClick={() => handleForceReleaseHold(lock.showId, lock.seatLayoutId, lock.seatLabel)}
                                disabled={actioning === lock.seatLayoutId}
                                className="btn btn-secondary"
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '0.75rem',
                                  borderColor: 'rgba(239, 68, 68, 0.3)',
                                  color: '#EF4444'
                                }}
                              >
                                {actioning === lock.seatLayoutId ? 'Releasing...' : 'Release Hold'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ROW 2: OCCUPANCY PANEL */}
            <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', fontFamily: 'var(--font-family-heading)' }}>
                📊 Show Occupancy Telemetry
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                {shows.map((show: any) => (
                  <div 
                    key={show.id}
                    style={{
                      padding: '16px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <strong style={{ fontSize: '0.95rem', display: 'block', color: '#FFFFFF' }}>{show.movie?.title}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {show.screen?.name} • {formatTimeLabel(show.show_time)}
                    </span>

                    {/* Custom Occupancy Progress Bar */}
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                        <span>Occupancy</span>
                        <strong>{show.occupancyRate}% ({show.bookedSeats}/{show.totalSeats} seats)</strong>
                      </div>
                      <div style={{ height: '8px', width: '100%', backgroundColor: '#25252E', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${show.occupancyRate}%`,
                          backgroundColor: show.occupancyRate > 75 ? '#10B981' : show.occupancyRate > 40 ? 'var(--highlight-gold)' : 'var(--accent-crimson)',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ROW 3: RECENT AUDIT TRAIL LOGS */}
            <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', fontFamily: 'var(--font-family-heading)' }}>
                📑 System Audit Trail
              </h3>

              <div style={{ overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '12px' }}>Timestamp</th>
                      <th style={{ padding: '12px' }}>Event</th>
                      <th style={{ padding: '12px' }}>Details</th>
                      <th style={{ padding: '12px' }}>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.slice(0, 50).map((log: any, index: number) => (
                      <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                          {new Date(log.created_at || log.timestamp).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            backgroundColor: log.action.includes('SUCCESS') ? 'rgba(16, 185, 129, 0.12)' : log.action.includes('CONFLICT') ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255,255,255,0.05)',
                            color: log.action.includes('SUCCESS') ? '#10B981' : log.action.includes('CONFLICT') ? '#EF4444' : '#FFFFFF'
                          }}>
                            {log.action}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontFamily: 'monospace', color: 'var(--text-secondary)', maxHeight: '40px', overflow: 'hidden' }}>
                          {JSON.stringify(log.details)}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{log.ip || 'Localhost'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      </main>
      <Footer />
    </>
  );
}
