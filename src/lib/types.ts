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
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  client_idempotency_key: string | null;
  qr_code_token: string | null;
  created_at: string;
  // Joins
  show?: Show;
  booking_seats?: { seat_layout_id: string; price: number; seat_layout?: SeatLayout }[];
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
  
  getShows(): Promise<Show[]>;
  getShowsForDate(date: string): Promise<Show[]>;
  getShowsForMovie(movieId: string): Promise<Show[]>;
  getShowById(id: string): Promise<Show | null>;
  createShow(show: Omit<Show, 'id' | 'created_at'>): Promise<Show>;
  deleteShow(id: string): Promise<boolean>;
  
  // Seat State
  getSeatsForShow(showId: string): Promise<SeatStatus[]>;
  lockSeats(showId: string, seatLayoutIds: string[], userId: string, holdSeconds?: number): Promise<boolean>;
  unlockSeats(showId: string, seatLayoutIds: string[], userId: string, force?: boolean): Promise<boolean>;
  
  // Bookings
  createBooking(
    showId: string,
    seatLayoutIds: string[],
    userId: string | null,
    channel: 'online' | 'counter',
    customerDetails: { name?: string; phone?: string; email?: string; idempotencyKey?: string }
  ): Promise<Booking>;
  confirmBooking(bookingId: string, showId: string, seatLayoutIds: string[], userId: string | null): Promise<boolean>;
  finalizeBooking(bookingId: string, paymentId: string, qrToken: string): Promise<Booking>;
  updateBookingStatus(bookingId: string, status: Booking['payment_status']): Promise<Booking>;
  getBookingById(id: string): Promise<Booking | null>;
  getBookings(): Promise<Booking[]>;
  getBookingsByUser(userId: string): Promise<Booking[]>;

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
  getAuditLogs(): Promise<AuditLog[]>;
}

