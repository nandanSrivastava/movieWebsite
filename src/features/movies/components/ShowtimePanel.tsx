'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Show as ShowType } from '@/lib/db';

interface ShowtimePanelProps {
  shows: ShowType[];
}

const isShowInPast = (showDate: string, showTime: string) => {
  try {
    // Parse with IST offset (+05:30)
    const showDateTime = new Date(`${showDate}T${showTime}+05:30`);
    return showDateTime.getTime() < Date.now();
  } catch {
    return false;
  }
};

export default function ShowtimePanel({ shows }: ShowtimePanelProps) {
  // Get unique dates from shows
  const uniqueDates = Array.from(new Set(shows.map((s) => s.show_date))).sort();
  
  // Set default selected date
  const [selectedDate, setSelectedDate] = useState<string>(uniqueDates[0] || '');

  if (shows.length === 0) {
    return (
      <div style={{
        padding: '50px 30px',
        backgroundColor: '#0F121C',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        textAlign: 'center',
        color: '#9CA3AF'
      }}>
        🎥 No shows currently scheduled for this movie. Please check back later.
      </div>
    );
  }

  // Helper to format date string to "Mon, Aug 9"
  const formatDateLabel = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
      return date.toLocaleDateString('en-US', options);
    } catch {
      return dateStr;
    }
  };

  // Filter shows for selected date
  const filteredShows = shows.filter((s) => s.show_date === selectedDate);

  // Group shows by screen
  const showsByScreen: Record<string, ShowType[]> = {};
  filteredShows.forEach((show) => {
    const screenName = show.screen?.name || 'Standard Screen';
    if (!showsByScreen[screenName]) {
      showsByScreen[screenName] = [];
    }
    showsByScreen[screenName].push(show);
  });

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

  return (
    <div style={{ marginTop: '40px' }}>
      <h3 style={{
        fontSize: '1.4rem',
        fontWeight: 800,
        marginBottom: '24px',
        fontFamily: 'var(--font-family-heading)',
        color: '#FFFFFF'
      }}>
        Select Showtime
      </h3>

      {/* Date Slider Selection */}
      <div style={{
        display: 'flex',
        gap: '12px',
        overflowX: 'auto',
        paddingBottom: '16px',
        marginBottom: '32px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        scrollbarWidth: 'thin'
      }}>
        {uniqueDates.map((date) => {
          const isSelected = date === selectedDate;
          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              style={{
                padding: '12px 24px',
                borderRadius: '30px',
                backgroundColor: isSelected ? 'var(--highlight-gold)' : 'rgba(255, 255, 255, 0.03)',
                color: isSelected ? '#070C15' : '#E5E7EB',
                border: isSelected ? '1px solid var(--highlight-gold)' : '1px solid rgba(255, 255, 255, 0.08)',
                fontWeight: 700,
                fontSize: '0.85rem',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                boxShadow: isSelected ? '0 4px 12px rgba(229, 193, 88, 0.2)' : 'none',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }
              }}
              onMouseOut={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                }
              }}
            >
              📅 {formatDateLabel(date)}
            </button>
          );
        })}
      </div>

      {/* Grouped Showtimes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        {Object.entries(showsByScreen).map(([screenName, screenShows]) => (
          <div 
            key={screenName}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              padding: '24px 28px',
              backgroundColor: '#0F121C',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '1.2rem' }}>🎬</span>
              <h4 style={{
                fontSize: '1.15rem',
                fontWeight: 800,
                color: 'var(--highlight-gold)',
                fontFamily: 'var(--font-family-heading)',
                margin: 0
              }}>
                {screenName}
              </h4>
            </div>

            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              {screenShows.map((show) => {
                const past = isShowInPast(show.show_date, show.show_time);
                if (past) {
                  return (
                    <div
                      key={show.id}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.01)',
                        border: '1px solid rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        padding: '10px 20px',
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)',
                        fontWeight: 700,
                        textAlign: 'center',
                        minWidth: '110px',
                        cursor: 'not-allowed',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.35
                      }}
                    >
                      <span style={{ textDecoration: 'line-through' }}>{formatTimeLabel(show.show_time)}</span>
                      <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '2px', letterSpacing: '0.5px' }}>Passed</span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={show.id}
                    href={`/booking/${show.id}`}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '14px 24px',
                      fontSize: '0.9rem',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      textDecoration: 'none',
                      textAlign: 'center',
                      minWidth: '110px',
                      transition: 'all 0.15s cubic-bezier(0.165, 0.84, 0.44, 1)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = 'var(--highlight-gold)';
                      e.currentTarget.style.color = 'var(--highlight-gold)';
                      e.currentTarget.style.backgroundColor = 'rgba(212, 175, 55, 0.05)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(212, 175, 55, 0.1)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.color = '#FFFFFF';
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {formatTimeLabel(show.show_time)}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
