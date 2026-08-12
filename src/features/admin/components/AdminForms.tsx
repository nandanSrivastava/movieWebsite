'use client';

import React from 'react';
import { useAdminStore } from '@/features/admin/store/adminStore';
import { useToast } from '@/features/shared/context/ToastContext';
import { useQueryClient } from '@tanstack/react-query';
import { isMockMode } from '@/lib/config';
import { supabase } from '@/lib/supabaseClient';

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

export default function AdminForms({ moviesList, screensList }: { moviesList: any[], screensList: any[] }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const {
    movieTitle, movieSynopsis, movieGenre, movieLanguage, movieDuration, movieCertification, moviePoster, movieTrailer, movieIsFeatured, movieSubmitting,
    setMovieField, resetMovieForm, setMovieSubmitting,
    scheduleMovieId, scheduleScreenId, scheduleDate, scheduleTime, priceClassic, pricePremium, scheduleSubmitting,
    setScheduleField, resetScheduleForm, setScheduleSubmitting
  } = useAdminStore();

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
          show_time: scheduleTime + ':00',
          price_classic: priceClassic,
          price_premium: pricePremium,
          price_normal: priceClassic,  // backward-compat
          price_recliner: priceClassic  // backward-compat
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

  return (
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Classic Price (₹)</label>
              <input
                type="number"
                required
                value={priceClassic}
                onChange={(e) => setScheduleField('priceClassic', e.target.value)}
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
              <label style={{ fontSize: '0.78rem', color: 'var(--gold-500)' }}>Premium Price (₹)</label>
              <input
                type="number"
                required
                value={pricePremium}
                onChange={(e) => setScheduleField('pricePremium', e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border-gold)',
                  borderRadius: '8px',
                  padding: '10px',
                  fontSize: '0.9rem',
                  color: 'var(--gold-500)',
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
  );
}
