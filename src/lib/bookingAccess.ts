import 'server-only';
import crypto from 'crypto';
import type { Booking } from './types';
import type { RequestUser } from './requestAuth';

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

/** Booking fields safe to send to the ticket holder's browser. */
export function ticketView(booking: Booking) {
  const {
    hold_owner: _holdOwner,
    client_idempotency_key: _idempotencyKey,
    checked_in_by: _checkedInBy,
    ...rest
  } = booking as Booking & { [key: string]: unknown };
  void _holdOwner; void _idempotencyKey; void _checkedInBy;

  const internal = ['refund_attempts', 'refund_locked_until', 'ticket_email_attempts', 'ticket_email_locked_until', 'customer_phone_digits'];
  for (const key of internal) delete (rest as Record<string, unknown>)[key];
  return rest;
}
