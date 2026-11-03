import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { canViewBooking, matchHolderBooking, ticketStillUsable, ticketView } from '../src/lib/bookingAccess';
import type { Booking } from '../src/lib/types';

const booking = (overrides: Partial<Booking> = {}) => ({
  id: 'b1',
  access_key: 'k'.repeat(64),
  booked_by: 'owner-1',
  hold_owner: 'owner-1',
  client_idempotency_key: 'idem',
  customer_phone: '9876543210',
  payment_status: 'paid',
  booking_seats: [{ seat_layout_id: 'seat-a' }, { seat_layout_id: 'seat-b' }],
  ...overrides,
}) as unknown as Booking;

describe('canViewBooking', () => {
  it('lets in the holder of the secret link, the owner, and staff', () => {
    expect(canViewBooking(booking(), 'k'.repeat(64), null)).toBe(true);
    expect(canViewBooking(booking(), null, { id: 'owner-1', role: 'user' })).toBe(true);
    expect(canViewBooking(booking(), null, { id: 'x', role: 'member' })).toBe(true);
    expect(canViewBooking(booking(), null, { id: 'x', role: 'admin' })).toBe(true);
  });

  it('keeps out everyone else', () => {
    expect(canViewBooking(booking(), null, null)).toBe(false);
    expect(canViewBooking(booking(), 'wrong', null)).toBe(false);
    expect(canViewBooking(booking(), 'k'.repeat(63) + 'x', null)).toBe(false);
    expect(canViewBooking(booking(), null, { id: 'someone-else', role: 'user' })).toBe(false);
    expect(canViewBooking(booking({ access_key: undefined }), '', null)).toBe(false);
  });
});

describe('what each audience receives', () => {
  it('no browser gets server bookkeeping, the key that opens a ticket, or an account id', () => {
    const view = ticketView(booking());
    for (const field of ['hold_owner', 'client_idempotency_key', 'access_key', 'booked_by']) expect(view).not.toHaveProperty(field);
    expect(view).toHaveProperty('customer_phone');
    expect(view).toHaveProperty('payment_status');
  });
});

describe('matchHolderBooking', () => {
  const ids = ['seat-a', 'seat-b'];

  it('finds the newest booking for exactly these seats, in any order', () => {
    const first = booking({ id: 'new' });
    expect(matchHolderBooking([first, booking({ id: 'old' })], ['seat-b', 'seat-a'])?.id).toBe('new');
  });

  it('ignores other seats, dead bookings and attempts the customer gave up', () => {
    const fewer = booking({ booking_seats: [{ seat_layout_id: 'seat-a' }] as any });
    expect(matchHolderBooking([fewer], ids)).toBeNull();
    expect(matchHolderBooking([booking({ payment_status: 'failed' })], ids)).toBeNull();
    expect(matchHolderBooking([booking({ payment_status: 'pending', superseded_at: '2026-01-01' })], ids)).toBeNull();
    expect(matchHolderBooking([booking({ payment_status: 'pending' })], ids)?.payment_status).toBe('pending');
    expect(matchHolderBooking([], ids)).toBeNull();
  });
});

describe('ticketStillUsable', () => {
  const on = (minutesFromNow: number, cancelled_at: string | null = null) => {
    const d = new Date(Date.now() + 5.5 * 3_600_000 + minutesFromNow * 60_000).toISOString();
    return booking({ show: { show_date: d.slice(0, 10), show_time: d.slice(11, 19), cancelled_at } as any });
  };

  it('keeps a ticket until the gate would refuse it for having ended', () => {
    expect(ticketStillUsable(on(120))).toBe(true);
    expect(ticketStillUsable(on(-230))).toBe(true);
    expect(ticketStillUsable(on(-250))).toBe(false);
  });

  it('drops tickets for cancelled shows', () => {
    expect(ticketStillUsable(on(120, '2026-01-01'))).toBe(false);
    expect(ticketStillUsable(booking({ show: undefined }))).toBe(false);
  });
});
