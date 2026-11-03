import { describe, it, expect } from 'vitest';
import { checkInWindow, gateTiming, showStartsAt } from '../src/lib/istDate';
import { ticketFromScan } from '../src/lib/ticketInput';
import { findOverlap } from '../src/features/admin/utils/showOverlap';
import { summarizeBookings } from '../src/features/admin/utils/bookingTotals';
import { isCounterRefund, refundReasonText } from '../src/features/shared/utils/refundReasons';
import { formatINR, formatShowDay } from '../src/features/shared/utils/format';

const MIN = 60_000;

describe('gateTiming', () => {
  const start = showStartsAt('2026-11-05', '18:00:00').getTime();
  const timing = (offsetMinutes: number) => gateTiming('2026-11-05', '18:00:00', start + offsetMinutes * MIN);

  it('passes a ticket for the show now letting people in', () => {
    expect(timing(-45)).toBe('on_time');
    expect(timing(0)).toBe('on_time');
    expect(timing(60)).toBe('on_time');
  });

  it('asks staff to look when the ticket is for another slot, though the gate would let it through', () => {
    // Slots run 3.5 hours apart: a 6 PM ticket at 3 PM, or a 6 PM ticket at 9:30 PM
    expect(timing(-46)).toBe('early');
    expect(timing(-180)).toBe('early');
    expect(checkInWindow('2026-11-05', '18:00:00', start - 180 * MIN)).toBe('open');
    expect(timing(61)).toBe('late');
    expect(timing(210)).toBe('late');
    expect(checkInWindow('2026-11-05', '18:00:00', start + 210 * MIN)).toBe('open');
  });
});

describe('ticketFromScan', () => {
  const id = '11111111-2222-3333-4444-555555555555';

  it('finds the ticket inside a pasted or scanned link', () => {
    expect(ticketFromScan(`https://www.dhrubcineplex.in/booking/confirmation/${id}?k=secret`)).toBe(id);
    expect(ticketFromScan(`https://www.dhrubcineplex.in/booking/confirmation/${id}`)).toBe(id);
    expect(ticketFromScan(`  https://x.in/verify?token=tkt_abc  `)).toBe('tkt_abc');
    expect(ticketFromScan('https://x.in/verify?id=abc')).toBe('abc');
  });

  it('leaves tokens, phone numbers and names alone', () => {
    expect(ticketFromScan('tkt_abc_def')).toBe('tkt_abc_def');
    expect(ticketFromScan(' 98765 43210 ')).toBe('98765 43210');
    expect(ticketFromScan('Asha Devi')).toBe('Asha Devi');
    expect(ticketFromScan('https://[not a url')).toBe('https://[not a url');
  });
});

describe('findOverlap', () => {
  const show = (show_time: string, durationMinutes = 120, show_date = '2026-11-05') => ({ show_date, show_time, durationMinutes });

  it('finds a clash with a film still running, or one that would start too soon', () => {
    expect(findOverlap(show('19:00'), [show('18:00')])).toBeTruthy();
    expect(findOverlap(show('17:00'), [show('18:00')])).toBeTruthy();
    expect(findOverlap(show('18:00'), [show('18:00')])).toBeTruthy();
  });

  it('leaves 15 minutes to clear the hall', () => {
    expect(findOverlap(show('20:14'), [show('18:00')])).toBeTruthy();
    expect(findOverlap(show('20:15'), [show('18:00')])).toBeNull();
  });

  it('sees across midnight', () => {
    expect(findOverlap(show('00:30', 120, '2026-11-06'), [show('23:30', 120, '2026-11-05')])).toBeTruthy();
    expect(findOverlap(show('10:00', 120, '2026-11-06'), [show('23:30', 120, '2026-11-05')])).toBeNull();
  });

  it('accepts a time written either way', () => {
    expect(findOverlap(show('18:00:00'), [show('18:30')])).toBeTruthy();
  });
});

describe('summarizeBookings', () => {
  it('adds money exactly and keeps cash, online and refunds apart', () => {
    const totals = summarizeBookings([
      { payment_status: 'paid', booking_channel: 'online', total_amount: '0.10', booking_seats: [{}] },
      { payment_status: 'paid', booking_channel: 'online', total_amount: '0.20', booking_seats: [{}, {}] },
      { payment_status: 'paid', booking_channel: 'counter', total_amount: 150, booking_seats: [{}] },
      { payment_status: 'refunded', booking_channel: 'online', total_amount: 200, booking_seats: [{}] },
      { payment_status: 'refund_pending', booking_channel: 'online', total_amount: 300, booking_seats: [{}] },
      { payment_status: 'pending', booking_channel: 'online', total_amount: 999, booking_seats: [{}] },
    ]);
    expect(totals).toEqual({ online: 0.3, cash: 150, collected: 150.3, refunded: 200, refundsPending: 300, tickets: 4 });
  });

  it('is all zero for an empty day', () => {
    expect(summarizeBookings([])).toEqual({ online: 0, cash: 0, collected: 0, refunded: 0, refundsPending: 0, tickets: 0 });
  });
});

describe('refund wording', () => {
  it('has words for every reason the database can store', () => {
    for (const reason of ['seats_unavailable', 'amount_mismatch', 'customer_changed_seats', 'show_cancelled', 'show_cancelled_cash', 'refunded_by_cinema', 'duplicate_payment', 'extra_payment']) {
      expect(refundReasonText(reason)).not.toBe(refundReasonText(null));
    }
  });

  it('only sends cash customers to the counter', () => {
    expect(isCounterRefund('show_cancelled_cash')).toBe(true);
    expect(isCounterRefund('show_cancelled')).toBe(false);
    expect(isCounterRefund(null)).toBe(false);
  });
});

describe('format', () => {
  it('shows paise only when there are some, and always two digits', () => {
    expect(formatINR(150)).toBe('₹150');
    expect(formatINR(150.5)).toBe('₹150.50');
    expect(formatINR('99.05')).toBe('₹99.05');
  });

  it('says Today and Tomorrow from the clock it is given, so server and browser agree', () => {
    const now = showStartsAt('2026-11-05', '23:59:00').getTime();
    expect(formatShowDay('2026-11-05', now)).toBe('Today');
    expect(formatShowDay('2026-11-06', now)).toBe('Tomorrow');
    expect(formatShowDay('2026-11-05', now + 2 * MIN)).not.toBe('Today');
  });
});
