// Property tests on pure helpers: each result is compared with an independent
// calculation, across many values, or checked against random hostile input.
import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { formatShowTime, formatINR, formatDuration, hasShowStarted, seatLabel, categoryPrice, formatShowDate } from '../src/features/shared/utils/format';
import { checkInWindow, showStartsAt, istDateString } from '../src/lib/istDate';
import { getDatesInRange } from '../src/features/admin/utils/dateRange';
import { networkKey } from '../src/lib/requestAuth';
import { safeRedirectPath } from '../src/features/auth/utils/safeRedirect';
import { escapeHtml } from '../src/lib/email/templates';

let x = 20261102;
const rnd = (n: number) => { x = (x * 1664525 + 1013904223) >>> 0; return x % n; };

describe('formatShowTime', () => {
  it('every minute of the day matches an independent 12-hour conversion', () => {
    for (let m = 0; m < 1440; m++) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0'); const mm = String(m % 60).padStart(2, '0');
      const h = Math.floor(m / 60);
      const want = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
      expect(formatShowTime(`${hh}:${mm}:00`)).toBe(want);
      expect(formatShowTime(`${hh}:${mm}`)).toBe(want);
    }
  });
});

describe('money', () => {
  it('toPaise equals exact integer arithmetic for every rupee and paise amount up to 20,000', () => {
    const toPaise = (amount: number | string) => Math.round(Number(amount) * 100);
    for (let r = 0; r <= 20000; r += 7) for (const p of [0, 1, 5, 10, 29, 33, 50, 57, 99]) {
      expect(toPaise(`${r}.${String(p).padStart(2, '0')}`)).toBe(r * 100 + p);
    }
  });
  it('formatINR uses Indian grouping', () => {
    expect(formatINR(1234567)).toBe('₹12,34,567');
    expect(formatINR(150)).toBe('₹150');
    expect(formatINR('99.50')).toBe('₹99.50');
    expect(formatINR(150.5)).toBe('₹150.50');
    expect(formatINR(null)).toBe('₹0');
    expect(formatINR('abc')).toBe('₹0');
  });
  it('categoryPrice falls back in the documented order', () => {
    expect(categoryPrice({ price_classic: 100, price_premium: 200 }, 'premium')).toBe(200);
    expect(categoryPrice({ price_classic: 100 }, 'premium')).toBe(100);
    expect(categoryPrice({ price_economy: 90 }, 'classic')).toBe(90);
    expect(categoryPrice({}, 'classic')).toBe(150);
    expect(categoryPrice({ price_classic: 0, price_premium: 0 }, 'premium')).toBe(0);
  });
});

describe('dates', () => {
  it('getDatesInRange matches independent day counting across leap years and month ends', () => {
    for (let i = 0; i < 400; i++) {
      const y = 2024 + rnd(9); const m = rnd(12); const d = 1 + rnd(28); const span = rnd(62);
      const start = new Date(Date.UTC(y, m, d)); const end = new Date(start.getTime() + span * 86400000);
      const s = start.toISOString().slice(0, 10); const e = end.toISOString().slice(0, 10);
      const out = getDatesInRange(s, e);
      expect(out.length).toBe(span + 1);
      expect(out[0]).toBe(s); expect(out[out.length - 1]).toBe(e);
      expect(new Set(out).size).toBe(out.length);
    }
    expect(getDatesInRange('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
    expect(getDatesInRange('2026-12-31', '2027-01-01')).toEqual(['2026-12-31', '2027-01-01']);
    expect(getDatesInRange('2026-11-05', '2026-11-01')).toEqual(['2026-11-05']);
    expect(getDatesInRange('2026-01-01', '2027-01-01').length).toBe(62);
  });
  it('istDateString flips at 18:30 UTC', () => {
    expect(istDateString(new Date('2026-11-02T18:29:59Z'))).toBe('2026-11-02');
    expect(istDateString(new Date('2026-11-02T18:30:00Z'))).toBe('2026-11-03');
    expect(istDateString(new Date('2026-12-31T18:30:00Z'))).toBe('2027-01-01');
  });
  it('checkInWindow boundaries', () => {
    const s = showStartsAt('2026-11-05', '18:30:00').getTime();
    const H = 3600000;
    expect(checkInWindow('2026-11-05', '18:30:00', s - 3 * H - 1)).toBe('too_early');
    expect(checkInWindow('2026-11-05', '18:30:00', s - 3 * H)).toBe('open');
    expect(checkInWindow('2026-11-05', '18:30:00', s + 4 * H)).toBe('open');
    expect(checkInWindow('2026-11-05', '18:30:00', s + 4 * H + 1)).toBe('closed');
  });
  it('hasShowStarted is true exactly from the start instant', () => {
    const s = showStartsAt('2026-11-05', '00:00:00').getTime();
    expect(hasShowStarted('2026-11-05', '00:00', s - 1)).toBe(false);
    expect(hasShowStarted('2026-11-05', '00:00', s)).toBe(true);
    expect(new Date(s).toISOString()).toBe('2026-11-04T18:30:00.000Z');
  });
  it('invalid values do not throw', () => {
    expect(hasShowStarted('garbage', 'x')).toBe(false);
    expect(formatShowDate('garbage')).toBe('garbage');
    expect(formatDuration(-5)).toBe('');
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(169)).toBe('2h 49m');
    expect(seatLabel(null, null)).toBe('-');
  });
});

describe('networkKey (IP grouping for rate limits)', () => {
  it('v6 addresses in one /64 share a key, different /64s do not', () => {
    expect(networkKey('2401:4900:1:2:aaaa::1')).toBe(networkKey('2401:4900:1:2:bbbb:cccc:dddd:eeee'));
    expect(networkKey('2401:4900:1:2::1')).not.toBe(networkKey('2401:4900:1:3::1'));
    expect(networkKey('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(networkKey('1.2.3.4')).toBe('1.2.3.4');
    expect(networkKey('2401:4900:0001:0002::1')).toBe(networkKey('2401:4900:1:2::1'));
    expect(networkKey('fe80::1%eth0')).toBe(networkKey('fe80::2'));
  });
});

describe('safeRedirectPath fuzz', () => {
  it('2000 hostile strings never resolve off-site', () => {
    const origin = 'https://www.dhrubcineplex.in';
    const bits = ['/', '\\', '//', '\\\\', '.', '..', '%2f', '%5c', '%09', '\t', '\n', '\r', ' ', 'evil.example', '@', ':', 'https:', 'javascript:', '#', '?', '&', '%00', 'é', '。'];
    for (let i = 0; i < 2000; i++) {
      let s = ''; for (let k = 0; k < 1 + rnd(6); k++) s += bits[rnd(bits.length)];
      const out = safeRedirectPath(s, origin, '/');
      expect(new URL(out, origin).origin, `input ${JSON.stringify(s)} gave ${out}`).toBe(origin);
    }
  });
});

describe('escapeHtml', () => {
  it('leaves no raw markup for 2000 random strings', () => {
    const chars = '<>&"\'a /=()`${}\\';
    for (let i = 0; i < 2000; i++) {
      let s = ''; for (let k = 0; k < rnd(40); k++) s += chars[rnd(chars.length)];
      const e = escapeHtml(s);
      expect(e).not.toMatch(/[<>"']/);
      const back = e.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      expect(back).toBe(s);
    }
  });
});
