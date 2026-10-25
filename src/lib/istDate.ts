// Show dates are stored as plain YYYY-MM-DD in cinema (India) local time.
export function istDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

/** When a show starts: show_date + show_time are India (IST, UTC+5:30) wall-clock values. */
export function showStartsAt(showDate: string, showTime: string): Date {
  const time = showTime.length === 5 ? `${showTime}:00` : showTime;
  return new Date(`${showDate}T${time}+05:30`);
}

// Gate check-in is allowed from 3 hours before a show starts until 4 hours after,
// so late-night shows that cross midnight work like any other.
export const CHECK_IN_OPENS_BEFORE_MS = 3 * 60 * 60 * 1000;
export const CHECK_IN_CLOSES_AFTER_MS = 4 * 60 * 60 * 1000;

export function checkInWindow(showDate: string, showTime: string, now = Date.now()): 'too_early' | 'open' | 'closed' {
  const start = showStartsAt(showDate, showTime).getTime();
  if (now < start - CHECK_IN_OPENS_BEFORE_MS) return 'too_early';
  if (now > start + CHECK_IN_CLOSES_AFTER_MS) return 'closed';
  return 'open';
}
