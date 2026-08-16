import 'server-only';
import { Movie, Screen, SeatLayout, Show, SeatStatus, Booking, Profile, AuditLog, DatabaseClient } from './types';

// ── IN-MEMORY MOCK DATABASE IMPLEMENTATION ─────────────────────
export class MockDatabase implements DatabaseClient {
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
      poster_url: '/posters/jawan.jpg',
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
      poster_url: '/posters/pathaan.jpg',
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
      poster_url: '/posters/animal.jpg',
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
      poster_url: '/posters/dangal.jpg',
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
      poster_url: '/posters/pk.jpg',
      trailer_url: 'https://www.youtube.com/embed/82ZEDGPCkT8',
      is_featured: false,
      is_active: true,
      created_at: new Date().toISOString()
    });

    // 3. Seed Screens & Layouts (Single Screen Theater)
    const s1 = 'a9f1a0e7-3f36-41b2-bb5b-43a0e698889c';

    this.screens.set(s1, { id: s1, name: 'Dhrub Talkies', total_rows: 9, seats_per_row: 18 });

    // ─────────────────────────────────────────────────────────────
    // Dhrub Talkies actual hall layout (from sketch, front → back):
    //
    //  Rows G, F, E, D, C, B, A — 18 seats: [1-5] | Aisle | [6-13] | Aisle | [14-18]
    //  Row P (Premium)          — 11 seats: [1-6] left + [7-11] right   → Premium ₹200
    //
    //  Category rules:
    //    Classic  (₹150): all rows G, F, E, D, C, B, A
    //    Premium  (₹200): Row P only
    // ─────────────────────────────────────────────────────────────
    const generateHallLayouts = (screenId: string): SeatLayout[] => {
      const layouts: SeatLayout[] = [];

      // Rows G, F, E, D, C, B, A — full 18-seat 3-section layout
      ['G', 'F', 'E', 'D', 'C', 'B', 'A'].forEach((row) => {
        for (let num = 1; num <= 18; num++) {
          layouts.push({ id: `layout-${screenId}-${row}-${num}`, screen_id: screenId, row_label: row, seat_number: num, category: 'classic' });
        }
      });

      // Row P (Premium) — left [1-6] + right [7-11] = ₹200 Premium
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].forEach((num) => {
        layouts.push({ id: `layout-${screenId}-P-${num}`, screen_id: screenId, row_label: 'P', seat_number: num, category: 'premium' });
      });

      return layouts;
    };

    const screen1Layouts = generateHallLayouts(s1);
    this.seatLayouts.set(s1, screen1Layouts);

    // 4. Seed Shows (Single Screen Sequential Schedule)
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const dayAfter = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];

    const showTimes = ['10:00:00', '13:30:00', '17:00:00', '20:30:00'];

    [today, tomorrow, dayAfter].forEach((date) => {
      showTimes.forEach((time, index) => {
        let movieId = m1;
        if (index === 1) movieId = m2;
        else if (index === 3) movieId = m4;
        else movieId = m1; // 10:00:00 & 17:00:00 slots for Bahubali

        const id = `show-s1-${date}-${time.replace(/:/g, '-')}`;
        this.shows.set(id, {
          id,
          movie_id: movieId,
          screen_id: s1,
          show_date: date,
          show_time: time,
          price_classic: 150,
          price_premium: 200,
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
      let category: SeatLayout['category'] = 'classic';
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

  public async deleteShow(id: string): Promise<boolean> {
    this.shows.delete(id);
    for (const key of Array.from(this.seatStatuses.keys())) {
      if (key.startsWith(`${id}:`)) {
        this.seatStatuses.delete(key);
      }
    }
    return true;
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
    customerDetails: { name?: string; phone?: string; email?: string; idempotencyKey?: string }
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

      let price = show.price_classic ?? (show as any).price_normal ?? 150;
      if (layout.category === 'premium') price = show.price_premium;
      
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
      customer_email: customerDetails.email || null,
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

    // Idempotent: first finalize wins, QR token stays stable on duplicates
    if (booking.payment_status !== 'paid') {
      booking.payment_status = 'paid';
      booking.razorpay_payment_id = paymentId;
      booking.qr_code_token = qrToken;
    }

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

