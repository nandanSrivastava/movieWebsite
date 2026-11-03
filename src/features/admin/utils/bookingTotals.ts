// Day-end totals for the owner, from a list of bookings. Money is counted in
// paise so adding up many amounts can't drift.

type CountedBooking = {
  payment_status: string;
  booking_channel?: string;
  total_amount: number | string;
  booking_seats?: unknown[];
};

export interface BookingTotals {
  online: number;
  cash: number;
  collected: number;
  refunded: number;
  refundsPending: number;
  tickets: number;
}

const toPaise = (amount: number | string) => Math.round(Number(amount) * 100);

export function summarizeBookings(bookings: CountedBooking[]): BookingTotals {
  let online = 0;
  let cash = 0;
  let refunded = 0;
  let refundsPending = 0;
  let tickets = 0;

  for (const b of bookings) {
    const paise = toPaise(b.total_amount);
    if (b.payment_status === 'paid') {
      if (b.booking_channel === 'counter') cash += paise;
      else online += paise;
      tickets += b.booking_seats?.length ?? 0;
    } else if (b.payment_status === 'refunded') {
      refunded += paise;
    } else if (b.payment_status === 'refund_pending') {
      refundsPending += paise;
    }
  }

  return {
    online: online / 100,
    cash: cash / 100,
    collected: (online + cash) / 100,
    refunded: refunded / 100,
    refundsPending: refundsPending / 100,
    tickets,
  };
}
