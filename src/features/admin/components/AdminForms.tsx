'use client';

import React, { useState, useEffect } from 'react';
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

const PRESET_TIMES = [
  { label: '10:00 AM', value: '10:00' },
  { label: '01:30 PM', value: '13:30' },
  { label: '05:00 PM', value: '17:00' },
  { label: '08:30 PM', value: '20:30' },
];

const formatTime12h = (timeStr: string) => {
  try {
    const [hStr, mStr] = timeStr.split(':');
    let h = parseInt(hStr);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h.toString().padStart(2, '0')}:${mStr} ${ampm}`;
  } catch {
    return timeStr;
  }
};

const getDatesInRange = (startStr: string, endStr: string): string[] => {
  if (!startStr) return [];
  if (!endStr || endStr < startStr) return [startStr];
  const list: string[] = [];
  let curr = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (curr <= end) {
    list.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }
  return list;
};

export default function AdminForms({ 
  moviesList, 
  screensList, 
  activeTab = 'overview', 
  isFormOpen = false,
  onCloseForm
}: { 
  moviesList: any[], 
  screensList: any[], 
  activeTab?: string, 
  isFormOpen?: boolean,
  onCloseForm?: () => void
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const {
    movieTitle, movieSynopsis, movieGenre, movieLanguage, movieDuration, movieCertification, moviePoster, movieTrailer, movieIsFeatured, movieSubmitting,
    setMovieField, resetMovieForm, setMovieSubmitting,
    scheduleMovieId, scheduleScreenId, scheduleDate, scheduleTime, priceClassic, pricePremium, scheduleSubmitting,
    setScheduleField, resetScheduleForm, setScheduleSubmitting
  } = useAdminStore();

  // Multi-day & Multi-time slot state
  const [isMultiDate, setIsMultiDate] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTimes, setSelectedTimes] = useState<string[]>(['10:00', '13:30', '17:00', '20:30']);
  const [customTime, setCustomTime] = useState('');

  // Onboard Member State
  const [memberFullName, setMemberFullName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [memberSubmitting, setMemberSubmitting] = useState(false);

  useEffect(() => {
    if (screensList.length > 0 && !scheduleScreenId) {
      setScheduleField('scheduleScreenId', screensList[0].id);
    }
  }, [screensList, scheduleScreenId, setScheduleField]);

  const toggleTimeSlot = (timeVal: string) => {
    if (selectedTimes.includes(timeVal)) {
      setSelectedTimes(selectedTimes.filter(t => t !== timeVal));
    } else {
      setSelectedTimes([...selectedTimes, timeVal].sort());
    }
  };

  const handleAddCustomTime = () => {
    if (!customTime) return;
    if (!selectedTimes.includes(customTime)) {
      setSelectedTimes([...selectedTimes, customTime].sort());
    }
    setCustomTime('');
  };

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
          duration_minutes: Number(movieDuration) || 120,
          certification: movieCertification,
          poster_url: moviePoster,
          trailer_url: movieTrailer,
          is_featured: movieIsFeatured
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to list movie.');

      showToast(`Successfully listed movie "${movieTitle}"!`, 'success');
      resetMovieForm();
      queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
      if (onCloseForm) onCloseForm();
    } catch (err: any) {
      showToast(err.message || 'Failed to list movie.', 'error');
    } finally {
      setMovieSubmitting(false);
    }
  };

  const handleCreateShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleMovieId || !scheduleScreenId) {
      showToast('Please select a movie and a screen.', 'error');
      return;
    }

    let datesToSchedule: string[] = [];
    if (!isMultiDate) {
      if (!scheduleDate) {
        showToast('Please select a show date.', 'error');
        return;
      }
      datesToSchedule = [scheduleDate];
    } else {
      if (!startDate) {
        showToast('Please select a start date.', 'error');
        return;
      }
      datesToSchedule = getDatesInRange(startDate, endDate || startDate);
    }

    if (selectedTimes.length === 0) {
      showToast('Please select at least one showtime slot.', 'error');
      return;
    }

    setScheduleSubmitting(true);

    try {
      const showsToCreate = [];
      for (const d of datesToSchedule) {
        for (const t of selectedTimes) {
          showsToCreate.push({
            movie_id: scheduleMovieId,
            screen_id: scheduleScreenId,
            show_date: d,
            show_time: t,
            price_classic: Number(priceClassic) || 150,
            price_premium: Number(pricePremium) || 200
          });
        }
      }

      const results = await Promise.allSettled(
        showsToCreate.map((showPayload) =>
          fetch('/api/shows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(showPayload)
          }).then(async (res) => {
            const resData = await res.json();
            if (!res.ok) throw new Error(resData.error || `Failed to schedule for ${showPayload.show_date}`);
            return resData;
          })
        )
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected');

      if (succeeded > 0) {
        showToast(`Successfully scheduled ${succeeded} showtime(s)!`, 'success');
        resetScheduleForm();
        setStartDate('');
        setEndDate('');
        queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
        if (onCloseForm) onCloseForm();
      }

      if (failed.length > 0) {
        const firstErr = (failed[0] as PromiseRejectedResult).reason;
        showToast(`Warning: ${failed.length} showtime(s) failed: ${firstErr?.message || 'Conflict detected'}`, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to schedule showtime.', 'error');
    } finally {
      setScheduleSubmitting(false);
    }
  };

  const handleOnboardMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberFullName || !memberEmail || !memberPassword) {
      showToast('Please fill in Full Name, Email, and Password.', 'error');
      return;
    }
    if (memberPassword.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    setMemberSubmitting(true);
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          full_name: memberFullName,
          email: memberEmail,
          phone: memberPhone,
          password: memberPassword
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to onboard member.');

      showToast(`Successfully onboarded counter staff: "${memberFullName}"!`, 'success');
      setMemberFullName('');
      setMemberEmail('');
      setMemberPhone('');
      setMemberPassword('');
      queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
      if (onCloseForm) onCloseForm();
    } catch (err: any) {
      showToast(err.message || 'Failed to onboard member.', 'error');
    } finally {
      setMemberSubmitting(false);
    }
  };

  const targetDatesCount = isMultiDate 
    ? (startDate ? getDatesInRange(startDate, endDate || startDate).length : 0)
    : (scheduleDate ? 1 : 0);
  const targetTimesCount = selectedTimes.length;
  const totalShowsToSchedule = targetDatesCount * targetTimesCount;

  if (!isFormOpen) return null;

  return (
    <div style={{ marginBottom: '28px' }}>
      
      {/* 🎬 ADD MOVIE FORM (MOVIES TAB) */}
      {activeTab === 'movies' && (
        <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--highlight-gold)', padding: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-family-heading)', color: 'var(--highlight-gold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🎬 Add New Movie to Catalog
            </h3>
            <button
              type="button"
              onClick={onCloseForm}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-muted)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              ✕ Close Form
            </button>
          </div>

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
                  outline: 'none'
                }}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
                Feature this movie in Hero Banner Carousel
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
            >
              {movieSubmitting ? 'Listing Movie...' : 'List Movie'}
            </button>
          </form>
        </div>
      )}

      {/* ⏰ SCHEDULE SHOWTIMES FORM (SHOWTIMES TAB) */}
      {activeTab === 'showtimes' && (
        <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid #F59E0B', padding: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-family-heading)', color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⏰ Bulk Schedule Showtimes
            </h3>
            <button
              type="button"
              onClick={onCloseForm}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-muted)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              ✕ Close Form
            </button>
          </div>

          <form onSubmit={handleCreateShow} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setIsMultiDate(false)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: !isMultiDate ? 'var(--highlight-gold)' : 'rgba(255,255,255,0.1)',
                  backgroundColor: !isMultiDate ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
                  color: !isMultiDate ? 'var(--highlight-gold)' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                📅 Single Day
              </button>
              <button
                type="button"
                onClick={() => setIsMultiDate(true)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: isMultiDate ? 'var(--highlight-gold)' : 'rgba(255,255,255,0.1)',
                  backgroundColor: isMultiDate ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
                  color: isMultiDate ? 'var(--highlight-gold)' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                🗓️ Multiple Days (Date Range)
              </button>
            </div>

            {!isMultiDate ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Show Date *</label>
                <input
                  type="date"
                  required={!isMultiDate}
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
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Start Date *</label>
                  <input
                    type="date"
                    required={isMultiDate}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
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
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>End Date *</label>
                  <input
                    type="date"
                    required={isMultiDate}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
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
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                ⏰ Select Showtime Slots for Each Day *
              </label>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {PRESET_TIMES.map((preset) => {
                  const isActive = selectedTimes.includes(preset.value);
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => toggleTimeSlot(preset.value)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: isActive ? '1px solid var(--highlight-gold)' : '1px solid rgba(255,255,255,0.1)',
                        backgroundColor: isActive ? 'rgba(212, 175, 55, 0.2)' : 'rgba(255,255,255,0.03)',
                        color: isActive ? '#FFFFFF' : 'var(--text-muted)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {isActive ? '✓ ' : '+ '}{preset.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '0.85rem',
                    color: '#FFFFFF',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddCustomTime}
                  disabled={!customTime}
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    color: '#FFFFFF',
                    cursor: customTime ? 'pointer' : 'not-allowed',
                    opacity: customTime ? 1 : 0.5
                  }}
                >
                  + Add Custom Slot
                </button>
              </div>

              {selectedTimes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {selectedTimes.map((t) => (
                    <span
                      key={t}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#10B981',
                        fontSize: '0.78rem',
                        fontWeight: 600
                      }}
                    >
                      {formatTime12h(t)}
                      <button
                        type="button"
                        onClick={() => toggleTimeSlot(t)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#10B981',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          padding: 0,
                          lineHeight: 1
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '4px' }}>
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

            {totalShowsToSchedule > 0 && (
              <div style={{
                marginTop: '6px',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(212, 175, 55, 0.1)',
                border: '1px solid rgba(212, 175, 55, 0.25)',
                fontSize: '0.82rem',
                color: 'var(--highlight-gold)',
                fontWeight: 600
              }}>
                ⚡ Will create {totalShowsToSchedule} showtime(s) ({targetDatesCount} day(s) × {targetTimesCount} time slot(s)).
              </div>
            )}

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
                marginTop: '8px',
                boxShadow: '0 4px 12px rgba(212,175,55,0.2)',
                transition: 'all 0.2s'
              }}
            >
              {scheduleSubmitting 
                ? 'Scheduling Showtimes...' 
                : totalShowsToSchedule > 1 
                  ? `Schedule ${totalShowsToSchedule} Showtimes` 
                  : 'Schedule Showtime'
              }
            </button>
          </form>
        </div>
      )}

      {/* 👤 ONBOARD MEMBER FORM (STAFF TAB) */}
      {activeTab === 'staff' && (
        <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid #10B981', padding: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-family-heading)', color: '#10B981', display: 'flex', alignItems: 'center', gap: '8px' }}>
              👤 Onboard Ticket Counter Member
            </h3>
            <button
              type="button"
              onClick={onCloseForm}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-muted)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              ✕ Close Form
            </button>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.4 }}>
            Admin action: Create member login credentials for ticket counter staff to handle POS bookings & entry checks.
          </p>

          <form onSubmit={handleOnboardMember} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={memberFullName}
                  onChange={(e) => setMemberFullName(e.target.value)}
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
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. ramesh.counter@dhrub.com"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
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
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Phone Number</label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={memberPhone}
                  onChange={(e) => setMemberPhone(e.target.value)}
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
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Assign Password *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={memberPassword}
                  onChange={(e) => setMemberPassword(e.target.value)}
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

            <button
              type="submit"
              disabled={memberSubmitting}
              style={{
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '12px',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
                marginTop: '8px',
                boxShadow: '0 4px 12px rgba(16,185,129,0.2)',
                transition: 'all 0.2s'
              }}
            >
              {memberSubmitting ? 'Onboarding Staff...' : 'Onboard Counter Member'}
            </button>
          </form>
        </div>
      )}

    </div>
  );
}
