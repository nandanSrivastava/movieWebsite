import { describe, it, expect, beforeAll } from 'vitest';
import { istDateString, showStartsAt, checkInWindow } from '../src/lib/istDate';
import { getDatesInRange } from '../src/features/admin/utils/dateRange';

describe('admin date range', () => {
  beforeAll(() => { process.env.TZ = 'Asia/Kolkata'; });

  it('schedules exactly the dates the admin picked (India timezone)', () => {
    expect(getDatesInRange('2026-10-25', '2026-10-27')).toEqual(['2026-10-25', '2026-10-26', '2026-10-27']);
    expect(getDatesInRange('2026-10-25', '2026-10-25')).toEqual(['2026-10-25']);
  });

  it('crosses month and year ends', () => {
    expect(getDatesInRange('2026-12-31', '2027-01-01')).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('caps a range at 62 days', () => {
    expect(getDatesInRange('2026-01-01', '2026-12-31')).toHaveLength(62);
  });
});

describe('India dates and the gate check-in window', () => {
  it('uses the India date, not the UTC date', () => {
    // 2026-10-24 20:00 UTC is already 2026-10-25 01:30 in India
    expect(istDateString(new Date('2026-10-24T20:00:00Z'))).toBe('2026-10-25');
  });

  it('reads show times as India wall-clock time', () => {
    expect(showStartsAt('2026-10-25', '20:30:00').toISOString()).toBe('2026-10-25T15:00:00.000Z');
  });

  it('lets people in for an after-midnight show the evening before', () => {
    // 00:15 show on the 26th; it's 23:40 on the 25th (India)
    const now = new Date('2026-10-25T18:10:00Z').getTime();
    expect(checkInWindow('2026-10-26', '00:15:00', now)).toBe('open');
  });

  it('is too early more than 3 hours before, and closed 4 hours after the start', () => {
    const start = showStartsAt('2026-10-25', '20:30:00').getTime();
    expect(checkInWindow('2026-10-25', '20:30:00', start - 3.5 * 3600_000)).toBe('too_early');
    expect(checkInWindow('2026-10-25', '20:30:00', start - 2 * 3600_000)).toBe('open');
    expect(checkInWindow('2026-10-25', '20:30:00', start + 4.5 * 3600_000)).toBe('closed');
  });
});
