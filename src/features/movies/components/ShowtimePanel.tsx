'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarX2 } from 'lucide-react';
import { Show as ShowType } from '@/lib/db';
import { useServerOffset } from '@/features/shared/hooks/useServerClock';
import { categoryPrice, formatINR, formatShowDay, formatShowTime, hasShowStarted, showDateParts } from '@/features/shared/utils/format';
import styles from './ShowtimePanel.module.css';

interface ShowtimePanelProps {
  shows: ShowType[];
  /** Server render time, so the first client render matches the HTML */
  renderedAt: number;
}

type Occupancy = Record<string, { booked: number; total: number }>;

// How full this film's shows are (CDN-cached ~10s, so the same list costs one read)
function useOccupancy(showIds: string[]) {
  const ids = [...showIds].sort().join(',');
  return useQuery({
    queryKey: ['showOccupancy', ids],
    queryFn: async (): Promise<Occupancy> => {
      const res = await fetch(`/api/shows/occupancy?ids=${ids}`);
      if (!res.ok) throw new Error('Could not load availability');
      return (await res.json()).occupancy;
    },
    enabled: ids.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}

function availability(o?: { booked: number; total: number }) {
  if (!o || o.total <= 0) return null;
  const ratio = o.booked / o.total;
  if (ratio >= 1) return 'soldOut' as const;
  if (ratio >= 0.7) return 'fillingFast' as const;
  return null;
}

export default function ShowtimePanel({ shows, renderedAt }: ShowtimePanelProps) {
  // Started shows drop off; "now" ticks after mount so the page can stay open.
  // It's the server's time: a phone with a wrong clock would otherwise lose shows.
  const serverOffset = useServerOffset();
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    if (serverOffset === null) return;
    setNow(Date.now() + serverOffset);
    const id = setInterval(() => setNow(Date.now() + serverOffset), 60_000);
    return () => clearInterval(id);
  }, [serverOffset]);

  const upcomingShows = shows.filter((s) => !hasShowStarted(s.show_date, s.show_time, now));
  const uniqueDates = Array.from(new Set(upcomingShows.map((s) => s.show_date))).sort();

  const [selectedDate, setSelectedDate] = useState<string>(uniqueDates[0] || '');

  // Keep selectedDate synchronized if uniqueDates changes
  useEffect(() => {
    if (uniqueDates.length > 0 && !uniqueDates.includes(selectedDate)) {
      setSelectedDate(uniqueDates[0]);
    }
  }, [uniqueDates, selectedDate]);

  const { data: occupancy } = useOccupancy(upcomingShows.map(s => s.id));

  if (upcomingShows.length === 0) {
    return (
      <div className={styles.empty}>
        <CalendarX2 aria-hidden />
        <div>
          <p className={styles.emptyTitle}>No shows scheduled yet</p>
          <p className={styles.emptyBody}>Check back soon, or see what else is playing.</p>
          <Link href="/movies" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>See all movies</Link>
        </div>
      </div>
    );
  }

  const dayShows = upcomingShows
    .filter((s) => s.show_date === selectedDate)
    .sort((a, b) => a.show_time.localeCompare(b.show_time));

  // Group by screen only if this cinema ever runs more than one
  const screens = Array.from(new Set(dayShows.map(s => s.screen?.name).filter(Boolean))) as string[];
  const groups = screens.length > 1
    ? screens.map(name => ({ name, shows: dayShows.filter(s => s.screen?.name === name) }))
    : [{ name: null as string | null, shows: dayShows }];

  return (
    <div className={styles.panel}>
      <div className={styles.dates} role="group" aria-label="Choose a date">
        {uniqueDates.map((date) => {
          const isSelected = date === selectedDate;
          const parts = showDateParts(date);
          const relative = formatShowDay(date, now);
          const isRelative = relative === 'Today' || relative === 'Tomorrow';
          return (
            <button
              key={date}
              type="button"
              className={styles.date}
              aria-pressed={isSelected}
              onClick={() => setSelectedDate(date)}
            >
              <span className={styles.dateTop}>{isRelative ? relative : parts.weekday}</span>
              <span className={styles.dateDay}>{parts.day}</span>
              <span className={styles.dateMonth}>{parts.month}</span>
            </button>
          );
        })}
      </div>

      {groups.map(group => (
        <div key={group.name ?? 'all'} className={styles.group}>
          {group.name && <h3 className={styles.screen}>{group.name}</h3>}
          <ul className={styles.times} aria-label={`Showtimes for ${formatShowDay(selectedDate, now)}`}>
            {group.shows.map((show) => {
              const state = availability(occupancy?.[show.id]);
              const time = formatShowTime(show.show_time);
              const from = `from ${formatINR(categoryPrice(show, 'classic'))}`;
              if (state === 'soldOut') {
                return (
                  <li key={show.id}>
                    <span className={`${styles.time} ${styles.soldOut}`} aria-disabled="true">
                      <span className={styles.timeLabel}>{time}</span>
                      <span className={styles.timeMeta}>Sold out</span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={show.id}>
                  <Link href={`/booking/${show.id}`} className={styles.time} aria-label={`${time}, ${from}${state === 'fillingFast' ? ', filling fast' : ''}`}>
                    <span className={styles.timeLabel}>{time}</span>
                    <span className={`${styles.timeMeta} ${state === 'fillingFast' ? styles.fast : ''}`}>
                      {state === 'fillingFast' ? 'Filling fast' : from}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
