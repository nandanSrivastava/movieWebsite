import 'server-only';
import crypto from 'crypto';
import type { Booking } from './types';
import type { RequestUser } from './requestAuth';
import { checkInWindow } from './istDate';

/**
 * A ticket (QR token, phone, email) is visible only to: whoever holds the
 * secret link key (buyer's browser and email), the signed-in account that
 * booked it, or counter staff / admins.
 */
export function canViewBooking(booking: Booking, accessKey: string | null | undefined, user: RequestUser | null): boolean {
  if (accessKey && booking.access_key) {
    const a = Buffer.from(accessKey);
    const b = Buffer.from(booking.access_key);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  if (user && booking.booked_by && user.id === booking.booked_by) return true;
  if (user && (user.role === 'admin' || user.role === 'member')) return true;
  return false;
}

// Bookkeeping nobody outside the server needs
const INTERNAL_FIELDS = [
  'hold_owner', 'client_idempotency_key', 'access_key', 'booked_by', 'checked_in_by', 'refund_attempts', 'refund_locked_until',
  'ticket_email_attempts', 'ticket_email_locked_until', 'customer_phone_digits', 'customer_phone_last10',
  'superseded_at', 'reconciled_at', 'refund_email_sent_at',
] as const;

/**
 * Booking fields safe to send to a browser, whether the ticket holder's or gate
 * staff's. The secret link key stays out, so staff can't open a ticket as its
 * customer, and so does the account id, which is also a hold owner's id.
 */
export function ticketView(booking: Booking) {
  const copy = { ...booking } as Booking & Record<string, unknown>;
  for (const key of INTERNAL_FIELDS) delete copy[key];
  return copy;
}

const seatsKey = (ids: string[]) => [...new Set(ids)].sort().join(',');

/**
 * From a customer's bookings (newest first), the one for exactly these seats.
 * A pending booking they gave up doesn't count, and neither does an abandoned
 * one: nothing about it is left to show them.
 */
export function matchHolderBooking(bookings: Booking[], seatLayoutIds: string[]): Booking | null {
  const wanted = seatsKey(seatLayoutIds);
  return bookings.find(b =>
    b.payment_status !== 'failed'
    && !(b.payment_status === 'pending' && b.superseded_at)
    && seatsKey((b.booking_seats ?? []).map(s => s.seat_layout_id)) === wanted
  ) ?? null;
}

/** A paid ticket is worth showing until the gate would refuse it for having ended. */
export const ticketStillUsable = (booking: Booking) =>
  !!booking.show && !booking.show.cancelled_at && checkInWindow(booking.show.show_date, booking.show.show_time) !== 'closed';
