import { istDateString, showStartsAt } from '@/lib/istDate';

// Show dates are stored as YYYY-MM-DD and times as HH:MM[:SS], both in
// cinema (India) time. These helpers keep every page saying them the same way.

const IST = 'Asia/Kolkata';

export { showStartsAt };

export function hasShowStarted(showDate: string, showTime: string, now = Date.now()): boolean {
  const start = showStartsAt(showDate, showTime).getTime();
  return !Number.isNaN(start) && start <= now;
}

// Noon IST keeps the calendar day stable whatever the viewer's timezone.
function dateAtNoon(showDate: string): Date {
  return new Date(`${showDate}T12:00:00+05:30`);
}

/** "Today", "Tomorrow", or "Sun, 25 Oct". */
export function formatShowDay(showDate: string): string {
  const today = istDateString();
  const tomorrow = istDateString(new Date(Date.now() + 86_400_000));
  if (showDate === today) return 'Today';
  if (showDate === tomorrow) return 'Tomorrow';
  return dateAtNoon(showDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST });
}

/** "Sun, 25 Oct 2026" (year optional). */
export function formatShowDate(showDate: string, { withYear = false }: { withYear?: boolean } = {}): string {
  const d = dateAtNoon(showDate);
  if (Number.isNaN(d.getTime())) return showDate;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: IST,
  });
}

/** Weekday and day number for date chips: { weekday: 'Sun', day: '25', month: 'Oct' }. */
export function showDateParts(showDate: string) {
  const d = dateAtNoon(showDate);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-IN', { ...o, timeZone: IST });
  return { weekday: part({ weekday: 'short' }), day: part({ day: 'numeric' }), month: part({ month: 'short' }) };
}

/** "1:30 PM". */
export function formatShowTime(showTime: string): string {
  const [h, m] = showTime.split(':');
  const hours = parseInt(h, 10);
  if (Number.isNaN(hours) || m === undefined) return showTime;
  return `${hours % 12 || 12}:${m.slice(0, 2)} ${hours >= 12 ? 'PM' : 'AM'}`;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** "₹1,050". */
export function formatINR(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  return inr.format(Number.isFinite(n) ? n : 0);
}

/** "2h 49m" from minutes. */
export function formatDuration(minutes: number | null | undefined): string {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return '';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return h ? `${h}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
}

/** Seat label as printed at the gate: "F-9". */
export function seatLabel(rowLabel?: string | null, seatNumber?: number | null): string {
  return `${rowLabel ?? ''}-${seatNumber ?? ''}`;
}

// Older rows used price_economy / price_normal for the classic price
type PricedShow = {
  price_classic?: number | null;
  price_premium?: number | null;
  price_economy?: number | null;
  price_normal?: number | null;
};

/** Display price per category, with the same fallbacks the booking pages always used.
 *  The server prices the booking itself; this is only what we show. */
export function categoryPrice(show: PricedShow, category: 'classic' | 'premium' | string | undefined): number {
  const classic = Number(show.price_classic ?? show.price_economy ?? show.price_normal ?? 150);
  if (category === 'premium') return Number(show.price_premium ?? classic);
  return classic;
}
