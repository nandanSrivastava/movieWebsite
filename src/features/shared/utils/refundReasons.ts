// Why a booking's money went back, in the customer's words. Used by the ticket
// page and the refund email so they always say the same thing.
const REFUND_REASONS: Record<string, string> = {
  seats_unavailable: 'The seat hold ran out and the seats went to another customer before your payment arrived.',
  amount_mismatch: 'The amount we received did not match the price of these seats.',
  customer_changed_seats: 'You let these seats go before this payment went through, so it was not needed.',
  show_cancelled: 'This show has been cancelled.',
  show_cancelled_cash: 'This show has been cancelled. You paid in cash, so please collect your money at the counter.',
  refunded_by_cinema: 'The cinema has refunded this booking, and this ticket can no longer be used.',
  duplicate_payment: 'We received more than one payment for this booking. Your ticket is still valid.',
  extra_payment: 'We received another payment for this booking, and it has been refunded as well.',
};

const DEFAULT_REASON = 'This booking could not be completed.';

export const refundReasonText = (reason: string | null | undefined): string =>
  (reason && REFUND_REASONS[reason]) || DEFAULT_REASON;

/** True when nothing is coming back to the customer's bank: they collect it in person. */
export const isCounterRefund = (reason: string | null | undefined) => reason === 'show_cancelled_cash';
