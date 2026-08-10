import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── DATA TYPE INTERFACES ─────────────────────────────────────
export interface Profile {
  id: string;
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
  category: 'normal' | 'premium' | 'recliner';
}

export interface Show {
  id: string;
  movie_id: string;
  screen_id: string;
  show_date: string;
  show_time: string;
  price_normal: number;
  price_premium: number;
  price_recliner: number;
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
  
  // Seat State
  getSeatsForShow(showId: string): Promise<SeatStatus[]>;
  lockSeats(showId: string, seatLayoutIds: string[], userId: string, holdSeconds?: number): Promise<boolean>;
  unlockSeats(showId: string, seatLayoutIds: string[], userId: string): Promise<boolean>;
  
  // Bookings
  createBooking(
    showId: string,
    seatLayoutIds: string[],
    userId: string | null,
    channel: 'online' | 'counter',
    customerDetails: { name?: string; phone?: string; idempotencyKey?: string }
  ): Promise<Booking>;
  confirmBooking(bookingId: string, showId: string, seatLayoutIds: string[], userId: string | null): Promise<boolean>;
  finalizeBooking(bookingId: string, paymentId: string, qrToken: string): Promise<Booking>;
  updateBookingStatus(bookingId: string, status: Booking['payment_status']): Promise<Booking>;
  getBookingById(id: string): Promise<Booking | null>;
  getBookings(): Promise<Booking[]>;
  getBookingsByUser(userId: string): Promise<Booking[]>;

  // Profiles
  getProfile(id: string): Promise<Profile | null>;
  createProfile(id: string, fullName: string, phone: string, role?: Profile['role']): Promise<Profile>;
  updateProfileRole(id: string, role: Profile['role']): Promise<Profile>;
  getProfiles(): Promise<Profile[]>;

  // Audit
  logAudit(userId: string | null, action: string, details: any, ip?: string): Promise<void>;
  getAuditLogs(): Promise<AuditLog[]>;
}

// ── IN-MEMORY MOCK DATABASE IMPLEMENTATION ─────────────────────
class MockDatabase implements DatabaseClient {
  public isMock = true;

  private movies = new Map<string, Movie>();
  private screens = new Map<string, Screen>();
  private seatLayouts = new Map<string, SeatLayout[]>(); // key screen_id
  private shows = new Map<string, Show>();
  private seatStatuses = new Map<string, SeatStatus>(); // key: show_id:seat_layout_id
  private bookings = new Map<string, Booking>();
  private bookingSeats: { booking_id: string; seat_layout_id: string; price: number }[] = [];
  private profiles = new Map<string, Profile>();
  private auditLogs: AuditLog[] = [];
  private processedWebhookEvents = new Set<string>();

  constructor() {
    this.seed();
    // Run background sweeper every 10 seconds to release locks
    if (typeof window === 'undefined') {
      setInterval(() => this.sweepExpiredLocks(), 10000);
    }
  }

  private seed() {
    // 1. Seed profiles
    const adminId = 'd0e56e07-6bcf-40a2-8b8b-d784fa734e56';
    const memberId = 'd0e56e07-6bcf-40a2-8b8b-d784fa734e57';
    this.profiles.set(adminId, {
      id: adminId,
      full_name: 'System Administrator',
      phone: '+919999999999',
      role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    this.profiles.set(memberId, {
      id: memberId,
      full_name: 'Counter Operator 1',
      phone: '+918888888888',
      role: 'member',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // 2. Seed Movies
    const m1 = 'd798a3b8-6c84-4828-98e3-50ebbc2a1d21';
    const m2 = 'e0e56e07-6bcf-40a2-8b8b-d784fa734e56';
    const m3 = '9d863f69-d9fe-45db-b962-73a71bbf5327';
    const m4 = 'a1b2c3d4-e5f6-7890-1234-56789abcdef0';
    const m5 = 'b2c3d4e5-f6a7-8901-2345-6789abcdef01';
    const m6 = 'c3d4e5f6-a7b8-9012-3456-789abcdef012';

    this.movies.set(m1, {
      id: m1,
      title: 'Bahubali',
      synopsis: 'In the kingdom of Mahishmati, Shivudu falls in love with a young warrior woman. While trying to woo her, he learns about the conflict-ridden past of his family and his true legacy.',
      genre: 'Action, Drama',
      language: 'Telugu (Hindi Dubbed)',
      duration_minutes: 159,
      certification: 'UA',
      poster_url: 'https://miro.medium.com/1*YdW-g6mqSnnS5ogid99EYg.jpeg',
      trailer_url: 'https://www.youtube.com/embed/sOEg_YZQsTI',
      is_featured: true,
      is_active: true,
      created_at: new Date().toISOString()
    });

    this.movies.set(m2, {
      id: m2,
      title: 'Jawan',
      synopsis: 'A high-octane action thriller which outlines the emotional journey of a man who is set to rectify the wrongs in the society.',
      genre: 'Action, Thriller',
      language: 'Hindi',
      duration_minutes: 169,
      certification: 'UA',
      poster_url: 'https://upload.wikimedia.org/wikipedia/en/3/39/Jawan_film_poster.jpg',
      trailer_url: 'https://www.youtube.com/embed/COv52Qyctws',
      is_featured: true,
      is_active: true,
      created_at: new Date().toISOString()
    });

    this.movies.set(m3, {
      id: m3,
      title: 'Pathaan',
      synopsis: 'An Indian spy takes on the leader of a group of mercenaries who have nefarious plans to target his homeland.',
      genre: 'Action, Thriller',
      language: 'Hindi',
      duration_minutes: 146,
      certification: 'UA',
      poster_url: 'https://upload.wikimedia.org/wikipedia/en/c/c3/Pathaan_film_poster.jpg',
      trailer_url: 'https://www.youtube.com/embed/vqu4z34wENw',
      is_featured: true,
      is_active: true,
      created_at: new Date().toISOString()
    });

    this.movies.set(m4, {
      id: m4,
      title: 'Animal',
      synopsis: 'The hardened son of a powerful industrialist returns home after years abroad and vows to take blood revenge on those threatening his fathers life.',
      genre: 'Action, Drama',
      language: 'Hindi',
      duration_minutes: 201,
      certification: 'A',
      poster_url: 'https://upload.wikimedia.org/wikipedia/en/9/90/Animal_%282023_film%29_poster.jpg',
      trailer_url: 'https://www.youtube.com/embed/Dydmpct60Qo',
      is_featured: true,
      is_active: true,
      created_at: new Date().toISOString()
    });

    this.movies.set(m5, {
      id: m5,
      title: 'Dangal',
      synopsis: 'Former wrestler Mahavir Singh Phogat and his two wrestler daughters struggle towards glory at the Commonwealth Games in the face of societal oppression.',
      genre: 'Biography, Drama',
      language: 'Hindi',
      duration_minutes: 161,
      certification: 'U',
      poster_url: 'https://upload.wikimedia.org/wikipedia/en/9/99/Dangal_Poster.jpg',
      trailer_url: 'https://www.youtube.com/embed/x_7YlGv9u1g',
      is_featured: false,
      is_active: true,
      created_at: new Date().toISOString()
    });

    this.movies.set(m6, {
      id: m6,
      title: 'PK',
      synopsis: 'An alien on Earth loses the only device he can use to communicate with his spaceship. His innocent nature and child-like questions force the country to evaluate the impact of religion on its people.',
      genre: 'Comedy, Drama',
      language: 'Hindi',
      duration_minutes: 153,
      certification: 'UA',
      poster_url: 'https://upload.wikimedia.org/wikipedia/en/c/c3/PK_poster.jpg',
      trailer_url: 'https://www.youtube.com/embed/82ZEDGPCkT8',
      is_featured: false,
      is_active: true,
      created_at: new Date().toISOString()
    });

    // 3. Seed Screens & Layouts
    const s1 = 'a9f1a0e7-3f36-41b2-bb5b-43a0e698889c';
    const s2 = 'bb28876c-3e6f-4db4-bb14-5d5b12165977';

    this.screens.set(s1, { id: s1, name: 'Screen 1 (IMAX)', total_rows: 8, seats_per_row: 10 });
    this.screens.set(s2, { id: s2, name: 'Screen 2 (Gold)', total_rows: 6, seats_per_row: 8 });

    // Generate Layouts for Screen 1
    const screen1Layouts: SeatLayout[] = [];
    const rowsS1 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    rowsS1.forEach((row) => {
      let category: SeatLayout['category'] = 'normal';
      if (['E', 'F'].includes(row)) category = 'premium';
      if (['G', 'H'].includes(row)) category = 'recliner';

      for (let num = 1; num <= 10; num++) {
        screen1Layouts.push({
          id: `layout-${s1}-${row}-${num}`,
          screen_id: s1,
          row_label: row,
          seat_number: num,
          category
        });
      }
    });
    this.seatLayouts.set(s1, screen1Layouts);

    // Generate Layouts for Screen 2
    const screen2Layouts: SeatLayout[] = [];
    const rowsS2 = ['A', 'B', 'C', 'D', 'E', 'F'];
    rowsS2.forEach((row) => {
      let category: SeatLayout['category'] = 'normal';
      if (['D', 'E'].includes(row)) category = 'premium';
      if (row === 'F') category = 'recliner';

      for (let num = 1; num <= 8; num++) {
        screen2Layouts.push({
          id: `layout-${s2}-${row}-${num}`,
          screen_id: s2,
          row_label: row,
          seat_number: num,
          category
        });
      }
    });
    this.seatLayouts.set(s2, screen2Layouts);

    // 4. Seed Shows
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const dayAfter = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];

    const showTimes1 = ['10:00:00', '13:30:00', '17:00:00', '20:30:00'];
    const showTimes2 = ['11:15:00', '14:45:00', '18:15:00', '21:45:00'];

    [today, tomorrow, dayAfter].forEach((date, dateIndex) => {
      // Screen 1 Mix
      showTimes1.forEach((time, index) => {
        let movieId = m1; // Default
        if (dateIndex === 0) movieId = index % 2 === 0 ? m1 : m4;
        if (dateIndex === 1) movieId = index % 2 === 0 ? m3 : m1;
        if (dateIndex === 2) movieId = index % 2 === 0 ? m4 : m5;

        const id = `show-s1-${date}-${time.replace(/:/g, '-')}`;
        this.shows.set(id, {
          id,
          movie_id: movieId,
          screen_id: s1,
          show_date: date,
          show_time: time,
          price_normal: 180,
          price_premium: 250,
          price_recliner: 400,
          created_at: new Date().toISOString()
        });
        
        // Initialize seat statuses as available
        const layouts = this.seatLayouts.get(s1) || [];
        layouts.forEach((layout) => {
          this.seatStatuses.set(`${id}:${layout.id}`, {
            id: `status-${id}-${layout.id}`,
            show_id: id,
            seat_layout_id: layout.id,
            status: 'available',
            locked_by: null,
            locked_at: null,
            lock_expires_at: null,
            booking_id: null
          });
        });
      });

      // Screen 2 Mix
      showTimes2.forEach((time, index) => {
        let movieId = m2; // Default
        if (dateIndex === 0) movieId = index % 2 === 0 ? m2 : m6;
        if (dateIndex === 1) movieId = index % 2 === 0 ? m6 : m2;
        if (dateIndex === 2) movieId = index % 2 === 0 ? m5 : m6;

        const id = `show-s2-${date}-${time.replace(/:/g, '-')}`;
        this.shows.set(id, {
          id,
          movie_id: movieId,
          screen_id: s2,
          show_date: date,
          show_time: time,
          price_normal: 150,
          price_premium: 220,
          price_recliner: 350,
          created_at: new Date().toISOString()
        });

        // Initialize seats
        const layouts = this.seatLayouts.get(s2) || [];
        layouts.forEach((layout) => {
          this.seatStatuses.set(`${id}:${layout.id}`, {
            id: `status-${id}-${layout.id}`,
            show_id: id,
            seat_layout_id: layout.id,
            status: 'available',
            locked_by: null,
            locked_at: null,
            lock_expires_at: null,
            booking_id: null
          });
        });
      });
    });
  }

  private sweepExpiredLocks() {
    const now = Date.now();
    for (const [key, status] of this.seatStatuses.entries()) {
      if (status.status === 'locked' && status.lock_expires_at) {
        const expiresTime = new Date(status.lock_expires_at).getTime();
        if (expiresTime < now) {
          status.status = 'available';
          status.locked_by = null;
          status.locked_at = null;
          status.lock_expires_at = null;
        }
      }
    }
  }

  // ── API IMPLS ──────────────────────────────────────────────
  public async getMovies(): Promise<Movie[]> {
    return Array.from(this.movies.values()).filter(m => m.is_active);
  }

  public async getMovieById(id: string): Promise<Movie | null> {
    return this.movies.get(id) || null;
  }

  public async createMovie(movie: Omit<Movie, 'id' | 'created_at'>): Promise<Movie> {
    const id = Math.random().toString(36).substring(2, 9);
    const newMovie: Movie = { ...movie, id, created_at: new Date().toISOString() };
    this.movies.set(id, newMovie);
    return newMovie;
  }

  public async updateMovie(id: string, movie: Partial<Movie>): Promise<Movie> {
    const existing = this.movies.get(id);
    if (!existing) throw new Error('Movie not found');
    const updated = { ...existing, ...movie };
    this.movies.set(id, updated);
    return updated;
  }

  public async getScreens(): Promise<Screen[]> {
    return Array.from(this.screens.values());
  }

  public async createScreen(name: string, rows: number, seatsPerRow: number): Promise<Screen> {
    const id = Math.random().toString(36).substring(2, 9);
    const newScreen: Screen = { id, name, total_rows: rows, seats_per_row: seatsPerRow };
    this.screens.set(id, newScreen);

    // Auto-generate layouts
    const layouts: SeatLayout[] = [];
    const rowLabels = Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i));
    rowLabels.forEach((row) => {
      let category: SeatLayout['category'] = 'normal';
      if (row >= 'E') category = 'premium';
      
      for (let num = 1; num <= seatsPerRow; num++) {
        layouts.push({
          id: `layout-${id}-${row}-${num}`,
          screen_id: id,
          row_label: row,
          seat_number: num,
          category
        });
      }
    });
    this.seatLayouts.set(id, layouts);
    return newScreen;
  }

  public async getShows(): Promise<Show[]> {
    return Array.from(this.shows.values()).map(s => this.enrichShow(s));
  }

  public async getShowsForDate(date: string): Promise<Show[]> {
    return Array.from(this.shows.values())
      .filter(s => s.show_date === date)
      .map(s => this.enrichShow(s));
  }

  public async getShowsForMovie(movieId: string): Promise<Show[]> {
    return Array.from(this.shows.values())
      .filter(s => s.movie_id === movieId)
      .map(s => this.enrichShow(s));
  }

  public async getShowById(id: string): Promise<Show | null> {
    const show = this.shows.get(id);
    return show ? this.enrichShow(show) : null;
  }

  public async createShow(show: Omit<Show, 'id' | 'created_at'>): Promise<Show> {
    const id = Math.random().toString(36).substring(2, 9);
    const newShow: Show = { ...show, id, created_at: new Date().toISOString() };
    this.shows.set(id, newShow);

    // Generate seats status
    const screenLayouts = this.seatLayouts.get(show.screen_id) || [];
    screenLayouts.forEach((layout) => {
      this.seatStatuses.set(`${id}:${layout.id}`, {
        id: `status-${id}-${layout.id}`,
        show_id: id,
        seat_layout_id: layout.id,
        status: 'available',
        locked_by: null,
        locked_at: null,
        lock_expires_at: null,
        booking_id: null
      });
    });

    return this.enrichShow(newShow);
  }

  private enrichShow(show: Show): Show {
    return {
      ...show,
      movie: this.movies.get(show.movie_id),
      screen: this.screens.get(show.screen_id)
    };
  }

  // ── SEAT MANAGEMENT ────────────────────────────────────────
  public async getSeatsForShow(showId: string): Promise<SeatStatus[]> {
    this.sweepExpiredLocks();
    const result: SeatStatus[] = [];
    const show = this.shows.get(showId);
    if (!show) return [];

    const screenLayouts = this.seatLayouts.get(show.screen_id) || [];
    for (const layout of screenLayouts) {
      const status = this.seatStatuses.get(`${showId}:${layout.id}`);
      if (status) {
        result.push({
          ...status,
          seat_layout: layout
        });
      }
    }
    return result;
  }

  public async lockSeats(showId: string, seatLayoutIds: string[], userId: string, holdSeconds = 360): Promise<boolean> {
    this.sweepExpiredLocks();
    
    // Simulate NOWAIT atomic check
    for (const layoutId of seatLayoutIds) {
      const current = this.seatStatuses.get(`${showId}:${layoutId}`);
      if (!current || current.status !== 'available') {
        return false; // seat not available or locked
      }
    }

    // Acquire lock
    const expiresAt = new Date(Date.now() + (holdSeconds + 15) * 1000).toISOString();
    seatLayoutIds.forEach((layoutId) => {
      const current = this.seatStatuses.get(`${showId}:${layoutId}`)!;
      current.status = 'locked';
      current.locked_by = userId;
      current.locked_at = new Date().toISOString();
      current.lock_expires_at = expiresAt;
    });

    return true;
  }

  public async unlockSeats(showId: string, seatLayoutIds: string[], userId: string): Promise<boolean> {
    seatLayoutIds.forEach((layoutId) => {
      const current = this.seatStatuses.get(`${showId}:${layoutId}`);
      if (current && current.status === 'locked' && current.locked_by === userId) {
        current.status = 'available';
        current.locked_by = null;
        current.locked_at = null;
        current.lock_expires_at = null;
      }
    });
    return true;
  }

  // ── BOOKING MANAGEMENT ─────────────────────────────────────
  public async createBooking(
    showId: string,
    seatLayoutIds: string[],
    userId: string | null,
    channel: 'online' | 'counter',
    customerDetails: { name?: string; phone?: string; idempotencyKey?: string }
  ): Promise<Booking> {
    if (customerDetails.idempotencyKey) {
      const existing = Array.from(this.bookings.values()).find(
        b => b.client_idempotency_key === customerDetails.idempotencyKey
      );
      if (existing) return existing;
    }

    const show = this.shows.get(showId);
    if (!show) throw new Error('Show not found');

    // Recalculate amount
    const screenLayouts = this.seatLayouts.get(show.screen_id) || [];
    let total = 0;
    const itemizedSeats: { seat_layout_id: string; price: number }[] = [];

    for (const layoutId of seatLayoutIds) {
      const layout = screenLayouts.find(l => l.id === layoutId);
      if (!layout) throw new Error('Invalid seat layout');

      let price = show.price_normal;
      if (layout.category === 'premium') price = show.price_premium;
      if (layout.category === 'recliner') price = show.price_recliner;
      
      total += Number(price);
      itemizedSeats.push({ seat_layout_id: layoutId, price: Number(price) });
    }

    const bookingId = Math.random().toString(36).substring(2, 9);
    const orderId = channel === 'online' ? `order_${Math.random().toString(36).substring(2, 9)}` : null;

    const newBooking: Booking = {
      id: bookingId,
      show_id: showId,
      booked_by: userId,
      booking_channel: channel,
      customer_name: customerDetails.name || null,
      customer_phone: customerDetails.phone || null,
      total_amount: total,
      payment_status: 'pending',
      razorpay_order_id: orderId,
      razorpay_payment_id: null,
      client_idempotency_key: customerDetails.idempotencyKey || null,
      qr_code_token: null,
      created_at: new Date().toISOString()
    };

    this.bookings.set(bookingId, newBooking);

    // Save items
    itemizedSeats.forEach((item) => {
      this.bookingSeats.push({
        booking_id: bookingId,
        seat_layout_id: item.seat_layout_id,
        price: item.price
      });
    });

    return newBooking;
  }

  public async confirmBooking(bookingId: string, showId: string, seatLayoutIds: string[], userId: string | null): Promise<boolean> {
    this.sweepExpiredLocks();
    
    // Validate current locks
    for (const layoutId of seatLayoutIds) {
      const current = this.seatStatuses.get(`${showId}:${layoutId}`);
      // If it's a counter booking, skip user lock checks since cashier confirms physical payment
      if (userId) {
        if (!current || current.status !== 'locked' || current.locked_by !== userId) {
          return false; // lock expired or belong to someone else
        }
      }
    }

    // Set seats as booked
    seatLayoutIds.forEach((layoutId) => {
      const current = this.seatStatuses.get(`${showId}:${layoutId}`)!;
      current.status = 'booked';
      current.booking_id = bookingId;
      current.locked_by = null;
      current.locked_at = null;
      current.lock_expires_at = null;
    });

    return true;
  }

  public async finalizeBooking(bookingId: string, paymentId: string, qrToken: string): Promise<Booking> {
    const booking = this.bookings.get(bookingId);
    if (!booking) throw new Error('Booking not found');

    booking.payment_status = 'paid';
    booking.razorpay_payment_id = paymentId;
    booking.qr_code_token = qrToken;

    return booking;
  }

  public async updateBookingStatus(bookingId: string, status: Booking['payment_status']): Promise<Booking> {
    const booking = this.bookings.get(bookingId);
    if (!booking) throw new Error('Booking not found');
    booking.payment_status = status;
    return booking;
  }

  public async getBookingById(id: string): Promise<Booking | null> {
    const booking = this.bookings.get(id);
    if (!booking) return null;

    const show = await this.getShowById(booking.show_id);
    const bookingSeatsList = this.bookingSeats
      .filter(bs => bs.booking_id === id)
      .map(bs => {
        const layouts = this.seatLayouts.get(show?.screen_id || '') || [];
        const seat_layout = layouts.find(l => l.id === bs.seat_layout_id);
        return {
          seat_layout_id: bs.seat_layout_id,
          price: bs.price,
          seat_layout
        };
      });

    return {
      ...booking,
      show: show || undefined,
      booking_seats: bookingSeatsList
    };
  }

  public async getBookings(): Promise<Booking[]> {
    const list: Booking[] = [];
    for (const b of this.bookings.values()) {
      const full = await this.getBookingById(b.id);
      if (full) list.push(full);
    }
    return list;
  }

  public async getBookingsByUser(userId: string): Promise<Booking[]> {
    const list: Booking[] = [];
    for (const b of this.bookings.values()) {
      if (b.booked_by === userId) {
        const full = await this.getBookingById(b.id);
        if (full) list.push(full);
      }
    }
    return list;
  }

  // ── PROFILE & AUDIT ────────────────────────────────────────
  public async getProfile(id: string): Promise<Profile | null> {
    return this.profiles.get(id) || null;
  }

  public async createProfile(id: string, fullName: string, phone: string, role: Profile['role'] = 'user'): Promise<Profile> {
    const newProfile: Profile = {
      id,
      full_name: fullName,
      phone,
      role,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.profiles.set(id, newProfile);
    return newProfile;
  }

  public async updateProfileRole(id: string, role: Profile['role']): Promise<Profile> {
    const existing = this.profiles.get(id);
    if (!existing) throw new Error('Profile not found');
    const updated = { ...existing, role, updated_at: new Date().toISOString() };
    this.profiles.set(id, updated);
    return updated;
  }

  public async getProfiles(): Promise<Profile[]> {
    return Array.from(this.profiles.values());
  }

  public async logAudit(userId: string | null, action: string, details: any, ip: string | null = null): Promise<void> {
    this.auditLogs.push({
      id: Math.random().toString(36).substring(2, 9),
      user_id: userId,
      action,
      details,
      ip_address: ip,
      created_at: new Date().toISOString()
    });
  }

  public async getAuditLogs(): Promise<AuditLog[]> {
    return this.auditLogs;
  }
}

// ── SUPABASE CLIENT DB IMPLEMENTATION ──────────────────────────
class SupabaseDatabaseClient implements DatabaseClient {
  public isMock = false;
  private supabase: SupabaseClient;

  constructor() {
    // Uses service role or anon key based on environment
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    this.supabase = createClient(url, key);
  }

  private async fetchWithRetry<T>(queryFn: () => any, retries = 2): Promise<T> {
    let attempt = 0;
    while (attempt <= retries) {
      try {
        const { data, error } = await queryFn();
        if (error) throw error;
        if (data === null) throw new Error('No data returned');
        return data;
      } catch (err) {
        if (attempt === retries) throw err;
        attempt++;
        await new Promise(resolve => setTimeout(resolve, attempt * 500)); // linear backoff
      }
    }
    throw new Error('Query failed after retries');
  }

  public async getMovies(): Promise<Movie[]> {
    return this.fetchWithRetry(() => 
      this.supabase.from('movies').select('*').eq('is_active', true)
    );
  }

  public async getMovieById(id: string): Promise<Movie | null> {
    const { data, error } = await this.supabase.from('movies').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  public async createMovie(movie: Omit<Movie, 'id' | 'created_at'>): Promise<Movie> {
    const { data, error } = await this.supabase.from('movies').insert(movie).select().single();
    if (error) throw error;
    return data;
  }

  public async updateMovie(id: string, movie: Partial<Movie>): Promise<Movie> {
    const { data, error } = await this.supabase.from('movies').update(movie).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  public async getScreens(): Promise<Screen[]> {
    return this.fetchWithRetry(() => this.supabase.from('screens').select('*'));
  }

  public async createScreen(name: string, rows: number, seatsPerRow: number): Promise<Screen> {
    const { data: screen, error } = await this.supabase.from('screens').insert({
      name,
      total_rows: rows,
      seats_per_row: seatsPerRow
    }).select().single();
    
    if (error) throw error;

    // Generate Layouts
    const layouts: any[] = [];
    const rowLabels = Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i));
    rowLabels.forEach((row) => {
      let category = 'normal';
      if (row >= 'E') category = 'premium';
      for (let num = 1; num <= seatsPerRow; num++) {
        layouts.push({
          screen_id: screen.id,
          row_label: row,
          seat_number: num,
          category
        });
      }
    });

    const { error: layoutError } = await this.supabase.from('seat_layout').insert(layouts);
    if (layoutError) throw layoutError;

    return screen;
  }

  public async getShows(): Promise<Show[]> {
    return this.fetchWithRetry(() => 
      this.supabase.from('shows').select('*, movie:movies(*), screen:screens(*)')
    );
  }

  public async getShowsForDate(date: string): Promise<Show[]> {
    return this.fetchWithRetry(() => 
      this.supabase.from('shows').select('*, movie:movies(*), screen:screens(*)').eq('show_date', date)
    );
  }

  public async getShowsForMovie(movieId: string): Promise<Show[]> {
    return this.fetchWithRetry(() => 
      this.supabase.from('shows').select('*, movie:movies(*), screen:screens(*)').eq('movie_id', movieId)
    );
  }

  public async getShowById(id: string): Promise<Show | null> {
    const { data, error } = await this.supabase
      .from('shows')
      .select('*, movie:movies(*), screen:screens(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  public async createShow(show: Omit<Show, 'id' | 'created_at'>): Promise<Show> {
    const { data: newShow, error } = await this.supabase.from('shows').insert(show).select().single();
    if (error) throw error;

    // Auto-generate seat_status mappings from seat_layout rows
    const { data: layouts, error: layoutError } = await this.supabase
      .from('seat_layout')
      .select('id')
      .eq('screen_id', show.screen_id);

    if (layoutError) throw layoutError;

    const statuses = layouts.map(l => ({
      show_id: newShow.id,
      seat_layout_id: l.id,
      status: 'available'
    }));

    const { error: statusError } = await this.supabase.from('seat_status').insert(statuses);
    if (statusError) throw statusError;

    return this.getShowById(newShow.id) as Promise<Show>;
  }

  public async getSeatsForShow(showId: string): Promise<SeatStatus[]> {
    return this.fetchWithRetry(() => 
      this.supabase
        .from('seat_status')
        .select('*, seat_layout:seat_layout(*)')
        .eq('show_id', showId)
    );
  }

  public async lockSeats(showId: string, seatLayoutIds: string[], userId: string, holdSeconds = 360): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('lock_seats', {
      p_show_id: showId,
      p_seat_layout_ids: seatLayoutIds,
      p_user_id: userId,
      p_ui_hold_seconds: holdSeconds
    });
    if (error) throw error;
    return data;
  }

  public async unlockSeats(showId: string, seatLayoutIds: string[], userId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('seat_status')
      .update({ status: 'available', locked_by: null, locked_at: null, lock_expires_at: null })
      .eq('show_id', showId)
      .eq('locked_by', userId)
      .in('seat_layout_id', seatLayoutIds);
    
    return !error;
  }

  public async createBooking(
    showId: string,
    seatLayoutIds: string[],
    userId: string | null,
    channel: 'online' | 'counter',
    customerDetails: { name?: string; phone?: string; idempotencyKey?: string }
  ): Promise<Booking> {
    // 1. Double check client idempotency
    if (customerDetails.idempotencyKey) {
      const { data: existing } = await this.supabase
        .from('bookings')
        .select('*')
        .eq('client_idempotency_key', customerDetails.idempotencyKey)
        .maybeSingle();

      if (existing) return existing;
    }

    // 2. Fetch prices
    const { data: show } = await this.supabase.from('shows').select('*').eq('id', showId).single();
    const { data: layouts } = await this.supabase.from('seat_layout').select('*').in('id', seatLayoutIds);

    if (!show || !layouts) throw new Error('Show or seat layouts not found');

    let total = 0;
    const items = layouts.map((layout) => {
      const price = {
        normal: show.price_normal,
        premium: show.price_premium,
        recliner: show.price_recliner
      }[layout.category as 'normal' | 'premium' | 'recliner'];
      total += Number(price);
      return { seat_layout_id: layout.id, price: Number(price) };
    });

    // 3. Create booking row
    const razorpayOrderId = channel === 'online' ? `order_placeholder_${Math.random().toString(36).slice(2)}` : null;

    const { data: booking, error: bookingErr } = await this.supabase.from('bookings').insert({
      show_id: showId,
      booked_by: userId,
      booking_channel: channel,
      customer_name: customerDetails.name || null,
      customer_phone: customerDetails.phone || null,
      total_amount: total,
      payment_status: 'pending',
      razorpay_order_id: razorpayOrderId,
      client_idempotency_key: customerDetails.idempotencyKey || null
    }).select().single();

    if (bookingErr) throw bookingErr;

    // 4. Create booking seats
    const seatRows = items.map(item => ({
      booking_id: booking.id,
      seat_layout_id: item.seat_layout_id,
      price: item.price
    }));

    const { error: seatErr } = await this.supabase.from('booking_seats').insert(seatRows);
    if (seatErr) throw seatErr;

    return booking;
  }

  public async confirmBooking(bookingId: string, showId: string, seatLayoutIds: string[], userId: string | null): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('confirm_booking', {
      p_booking_id: bookingId,
      p_show_id: showId,
      p_seat_layout_ids: seatLayoutIds,
      p_user_id: userId
    });
    if (error) throw error;
    return data;
  }

  public async finalizeBooking(bookingId: string, paymentId: string, qrToken: string): Promise<Booking> {
    const { data, error } = await this.supabase
      .from('bookings')
      .update({
        payment_status: 'paid',
        razorpay_payment_id: paymentId,
        qr_code_token: qrToken
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  public async updateBookingStatus(bookingId: string, status: Booking['payment_status']): Promise<Booking> {
    const { data, error } = await this.supabase
      .from('bookings')
      .update({ payment_status: status })
      .eq('id', bookingId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  public async getBookingById(id: string): Promise<Booking | null> {
    const { data, error } = await this.supabase
      .from('bookings')
      .select('*, show:shows(*, movie:movies(*), screen:screens(*)), booking_seats(seat_layout_id, price, seat_layout:seat_layout(*))')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  public async getBookings(): Promise<Booking[]> {
    const { data, error } = await this.supabase
      .from('bookings')
      .select('*, show:shows(*, movie:movies(*), screen:screens(*))')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  public async getBookingsByUser(userId: string): Promise<Booking[]> {
    const { data, error } = await this.supabase
      .from('bookings')
      .select('*, show:shows(*, movie:movies(*), screen:screens(*))')
      .eq('booked_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  public async getProfile(id: string): Promise<Profile | null> {
    const { data, error } = await this.supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  public async createProfile(id: string, fullName: string, phone: string, role: Profile['role'] = 'user'): Promise<Profile> {
    const { data, error } = await this.supabase.from('profiles').insert({
      id,
      full_name: fullName,
      phone,
      role
    }).select().single();

    if (error) throw error;
    return data;
  }

  public async updateProfileRole(id: string, role: Profile['role']): Promise<Profile> {
    const { data, error } = await this.supabase
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  public async getProfiles(): Promise<Profile[]> {
    const { data, error } = await this.supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  public async logAudit(userId: string | null, action: string, details: any, ip?: string): Promise<void> {
    await this.supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      details,
      ip_address: ip || null
    });
  }

  public async getAuditLogs(): Promise<AuditLog[]> {
    const { data, error } = await this.supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
}

// ── CLIENT SINGLETON EXPORT ───────────────────────────────────
const isSupabaseConfigured = 
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
  (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

const globalRef = global as any;
if (!globalRef.cinebookDatabase) {
  if (isSupabaseConfigured) {
    globalRef.cinebookDatabase = new SupabaseDatabaseClient();
  } else {
    globalRef.cinebookDatabase = new MockDatabase();
  }
}

export const db: DatabaseClient = globalRef.cinebookDatabase;
export const isMockMode = !isSupabaseConfigured;
export type { Movie as MovieType, Show as ShowType, SeatStatus as SeatStatusType, Booking as BookingType, Profile as ProfileType };
