// ── DATA TYPE INTERFACES ─────────────────────────────────────
export interface Profile {
  id: string;
  email?: string;
  full_name: string;
  phone: string;
  role: 'admin' | 'member' | 'user';
  created_at: string;
  updated_at: string;
}

export interface Movie {
  id: string;
  title: string;
  synopsis: string;
  genre: string;
  language: string;
  duration_minutes: number;
  certification: string;
  poster_url: string;
  trailer_url: string;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Screen {
  id: string;
  name: string;
  total_rows: number;
  seats_per_row: number;
}

export interface SeatLayout {
  id: string;
  screen_id: string;
  row_label: string;
  seat_number: number;
  category: 'classic' | 'premium';
}

export interface Show {
  id: string;
  movie_id: string;
  screen_id: string;
  show_date: string;
  show_time: string;
  price_classic: number;   // ₹150
  price_premium: number;   // ₹200 
  created_at: string;
  // Joins
  movie?: Movie;
  screen?: Screen;
}

export interface SeatStatus {
  id: string;
  show_id: string;
  seat_layout_id: string;
  status: 'available' | 'locked' | 'booked';
  locked_by: string | null;
  locked_at: string | null;
  lock_expires_at: string | null;
  booking_id: string | null;
  // Joins
  seat_layout?: SeatLayout;
}

export interface Booking {
  id: string;
  show_id: string;
  booked_by: string | null;
  booking_channel: 'online' | 'counter';
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  total_amount: number;
  payment_status: 'pending' | 'paid' | 'failed' | 'refund_pending' | 'refunded';
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  client_idempotency_key: string | null;
  qr_code_token: string | null;
  created_at: string;
  checked_in_at?: string | null;
  checked_in_by?: string | null;
  hold_owner?: string | null;
  access_key?: string;
  paid_at?: string | null;
  refund_reason?: string | null;
  razorpay_refund_id?: string | null;
  ticket_email_sent_at?: string | null;
  // Joins
  show?: Show;
  booking_seats?: { seat_layout_id: string; price: number; seat_layout?: SeatLayout }[];
}

// Seat-hold and payment outcomes returned by the database functions
export type LockResult = 'ok' | 'taken' | 'owner_cap' | 'ip_cap' | 'show_started' | 'invalid';
export type FinalizeResult = 'confirmed' | 'already_paid' | 'refunding' | 'conflict' | 'not_found';

// Public seat-map state: no holder ids, no booking ids
export interface PendingBookingResult {
  status: 'ok' | 'existing' | 'hold_expired' | 'show_started' | 'invalid';
  booking: Booking | null;
  holdExpiresAt: string | null;
}

export interface SeatAvailability {
  seat_layout_id: string;
  status: SeatStatus['status'];
}

export interface SeatHold {
  seat_layout_id: string;
  lock_expires_at: string;
}

export interface ActiveLock {
  showId: string;
  seatLayoutId: string;
  seatLabel: string;
  lockedBy: string | null;
  expiresAt: string;
  movieTitle: string;
  screenName: string;
  showDate: string;
  showTime: string;
}

export interface SalesSummary {
  paidRevenue: number;
  paidBookings: number;
  ticketsSold: number;
  refundsPending: number;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  details: any;
  ip_address: string | null;
  created_at: string;
}


// ── DATABASE CLIENT INTERFACE ─────────────────────────────────
export interface DatabaseClient {
  isMock: boolean;
  
  // Catalog
  getMovies(): Promise<Movie[]>;
  getMovieById(id: string): Promise<Movie | null>;
  createMovie(movie: Omit<Movie, 'id' | 'created_at'>): Promise<Movie>;
  updateMovie(id: string, movie: Partial<Movie>): Promise<Movie>;
  
  getScreens(): Promise<Screen[]>;
  createScreen(name: string, rows: number, seatsPerRow: number): Promise<Screen>;
  
  getShows(fromDate?: string): Promise<Show[]>;
  getShowsForDate(date: string): Promise<Show[]>;
  getShowsForMovie(movieId: string): Promise<Show[]>;
  getShowById(id: string): Promise<Show | null>;
  createShow(show: Omit<Show, 'id' | 'created_at'>): Promise<Show>;
  deleteShow(id: string): Promise<boolean>;
  
  // Seat State
  getSeatsForShow(showId: string): Promise<SeatStatus[]>;
  getSeatAvailability(showId: string): Promise<SeatAvailability[]>;
  getSeatHolds(showId: string, owner: string): Promise<SeatHold[]>;
  lockSeats(showId: string, seatLayoutIds: string[], owner: string, clientIp: string | null): Promise<LockResult>;
  extendSeatHolds(showId: string, seatLayoutIds: string[], owner: string, seconds: number): Promise<string | null>;
  releaseSeatHolds(showId: string, seatLayoutIds: string[], owner: string): Promise<void>;
  forceReleaseSeatHolds(showId: string, seatLayoutIds: string[]): Promise<void>;
  getActiveLocks(): Promise<ActiveLock[]>;
  getShowOccupancy(showIds: string[]): Promise<Record<string, { total: number; booked: number }>>;

  // Bookings
  // Atomic checkout step: checks + extends the caller's holds, prices from the DB,
  // writes the booking with its seats (see create_pending_booking in migration 004)
  createPendingBooking(params: {
    showId: string;
    seatLayoutIds: string[];
    userId: string | null;
    holdOwner: string;
    channel: 'online' | 'counter';
    name: string;
    phone: string;
    email: string | null;
    idempotencyKey: string;
    holdSeconds: number;
  }): Promise<PendingBookingResult>;
  setBookingOrderId(bookingId: string, orderId: string): Promise<void>;
  getBookingById(id: string): Promise<Booking | null>;
  getBookingByOrderId(orderId: string): Promise<Booking | null>;
  getBookingsByUser(userId: string): Promise<Booking[]>;
  findPaidBookingsByPhone(phoneDigits: string, limit: number): Promise<Booking[]>;

  // Payments (finalizePayment is the only way a booking becomes paid)
  finalizePayment(bookingId: string, paymentId: string, qrToken: string, conflictStatus: 'refund_pending' | 'failed'): Promise<FinalizeResult>;
  expirePendingBooking(bookingId: string): Promise<boolean>;
  queueRefund(bookingId: string, paymentId: string, reason: string): Promise<boolean>;
  claimRefund(bookingId: string): Promise<Booking | null>;
  completeRefund(bookingId: string, refundId: string | null): Promise<void>;
  getPendingOnlineBookings(olderThanSeconds: number, limit: number): Promise<Booking[]>;
  getRefundPendingBookings(limit: number): Promise<Booking[]>;
  hasProcessedWebhookEvent(eventId: string): Promise<boolean>;
  recordWebhookEvent(eventId: string): Promise<void>;

  // Ticket email outbox
  claimTicketEmail(bookingId: string): Promise<boolean>;
  markTicketEmailSent(bookingId: string): Promise<void>;
  getUnsentTicketEmailBookings(limit: number): Promise<Booking[]>;

  // Gate verification
  getBookingByQrToken(token: string): Promise<Booking | null>;
  searchPaidBookings(query: { phoneDigits: string } | { name: string }, limit: number): Promise<Booking[]>;
  getPaidBookingsForShowDate(showDate: string, limit: number): Promise<Booking[]>;
  checkInBooking(bookingId: string, staffId: string | null): Promise<boolean>;

  // Limits & reporting
  rateLimitHit(key: string, windowSeconds: number, limit: number): Promise<boolean>;
  getSalesSummary(): Promise<SalesSummary>;

  // Profiles & Onboarding
  getProfile(id: string): Promise<Profile | null>;
  getProfileByEmail?(email: string): Promise<Profile | null>;
  createProfile(id: string, fullName: string, phone: string, role?: Profile['role'], email?: string): Promise<Profile>;
  updateProfileRole(id: string, role: Profile['role']): Promise<Profile>;
  getProfiles(): Promise<Profile[]>;
  getMembers(): Promise<Profile[]>;
  onboardMember(email: string, fullName: string, phone: string): Promise<Profile>;

  // Audit
  logAudit(userId: string | null, action: string, details: any, ip?: string): Promise<void>;
  getAuditLogs(limit: number): Promise<AuditLog[]>;
}

