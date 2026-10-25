import 'server-only';
import {
  Movie, Screen, SeatLayout, Show, SeatStatus, Booking, Profile, AuditLog, DatabaseClient,
  LockResult, FinalizeResult, SeatAvailability, SeatHold, ActiveLock, SalesSummary, PendingBookingResult
} from './types';

import { istDateString } from './istDate';

const HOLD_MS = 8 * 60 * 1000;
const MAX_SEATS_PER_OWNER = 10;
const MAX_SEATS_PER_IP = 24;

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
  private lockIps = new Map<string, string | null>(); // key: show_id:seat_layout_id
  private rateLimits = new Map<string, number>();

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
      email: 'admin@cinebook.com',
      full_name: 'System Administrator',
      phone: '+919999999999',
      role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    this.profiles.set(memberId, {
      id: memberId,
      email: 'member@cinebook.com',
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
    const today = istDateString();
    const tomorrow = istDateString(new Date(Date.now() + 86400000));
    const dayAfter = istDateString(new Date(Date.now() + 86400000 * 2));

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
          this.clearHold(key, status);
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

  public async getShows(fromDate?: string): Promise<Show[]> {
    return Array.from(this.shows.values())
      .filter(s => !fromDate || s.show_date >= fromDate)
      .sort((a, b) => `${a.show_date}${a.show_time}`.localeCompare(`${b.show_date}${b.show_time}`))
      .map(s => this.enrichShow(s));
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

  private isActiveHold(seat: SeatStatus) {
    return seat.status === 'locked' && !!seat.lock_expires_at && new Date(seat.lock_expires_at).getTime() > Date.now();
  }

  private clearHold(key: string, seat: SeatStatus) {
    seat.status = 'available';
    seat.locked_by = null;
    seat.locked_at = null;
    seat.lock_expires_at = null;
    this.lockIps.delete(key);
  }

  public async getSeatAvailability(showId: string): Promise<SeatAvailability[]> {
    const seats = await this.getSeatsForShow(showId);
    return seats.map(s => ({ seat_layout_id: s.seat_layout_id, status: s.status }));
  }

  public async getSeatHolds(showId: string, owner: string): Promise<SeatHold[]> {
    this.sweepExpiredLocks();
    return Array.from(this.seatStatuses.values())
      .filter(s => s.show_id === showId && s.locked_by === owner && this.isActiveHold(s))
      .map(s => ({ seat_layout_id: s.seat_layout_id, lock_expires_at: s.lock_expires_at! }));
  }

  // Mirrors public.lock_seats() in supabase/migrations/002_launch_hardening.sql
  public async lockSeats(showId: string, seatLayoutIds: string[], owner: string, clientIp: string | null): Promise<LockResult> {
    this.sweepExpiredLocks();
    const ids = Array.from(new Set(seatLayoutIds));
    if (!owner || ids.length === 0 || ids.length > MAX_SEATS_PER_OWNER) return 'invalid';

    const show = this.shows.get(showId);
    if (!show) return 'invalid';
    if (new Date(`${show.show_date}T${show.show_time}+05:30`).getTime() < Date.now()) return 'show_started';

    const targets = ids.map(id => this.seatStatuses.get(`${showId}:${id}`));
    if (targets.some(t => !t)) return 'invalid';
    if (targets.some(t => t!.status === 'booked' || (this.isActiveHold(t!) && t!.locked_by !== owner))) return 'taken';

    const active = Array.from(this.seatStatuses.entries()).filter(([, st]) => this.isActiveHold(st));
    const ownerHeld = active.filter(([, st]) => st.locked_by === owner && st.show_id !== showId).length;
    if (ownerHeld + ids.length > MAX_SEATS_PER_OWNER) return 'owner_cap';
    if (clientIp) {
      const ipHeld = active.filter(([key, st]) =>
        this.lockIps.get(key) === clientIp && !(st.show_id === showId && st.locked_by === owner)).length;
      if (ipHeld + ids.length > MAX_SEATS_PER_IP) return 'ip_cap';
    }

    for (const [key, st] of this.seatStatuses.entries()) {
      if (st.show_id === showId && st.locked_by === owner && st.status === 'locked' && !ids.includes(st.seat_layout_id)) {
        this.clearHold(key, st);
      }
    }

    const expiresAt = new Date(Date.now() + HOLD_MS).toISOString();
    ids.forEach((id) => {
      const st = this.seatStatuses.get(`${showId}:${id}`)!;
      st.status = 'locked';
      st.locked_by = owner;
      st.locked_at = new Date().toISOString();
      st.lock_expires_at = expiresAt;
      this.lockIps.set(`${showId}:${id}`, clientIp);
    });
    return 'ok';
  }

  public async extendSeatHolds(showId: string, seatLayoutIds: string[], owner: string, seconds: number): Promise<string | null> {
    this.sweepExpiredLocks();
    const expires = new Date(Date.now() + Math.min(Math.max(seconds, 60), 1200) * 1000).toISOString();
    const held = seatLayoutIds
      .map(id => this.seatStatuses.get(`${showId}:${id}`))
      .filter(st => st && st.locked_by === owner && this.isActiveHold(st)) as SeatStatus[];
    held.forEach(st => { if (st.lock_expires_at! < expires) st.lock_expires_at = expires; });
    return held.length === new Set(seatLayoutIds).size ? expires : null;
  }

  public async releaseSeatHolds(showId: string, seatLayoutIds: string[], owner: string): Promise<void> {
    seatLayoutIds.forEach((id) => {
      const key = `${showId}:${id}`;
      const st = this.seatStatuses.get(key);
      if (st && st.status === 'locked' && st.locked_by === owner) this.clearHold(key, st);
    });
  }

  public async forceReleaseSeatHolds(showId: string, seatLayoutIds: string[]): Promise<void> {
    seatLayoutIds.forEach((id) => {
      const key = `${showId}:${id}`;
      const st = this.seatStatuses.get(key);
      if (st && st.status === 'locked') this.clearHold(key, st);
    });
  }

  public async getActiveLocks(): Promise<ActiveLock[]> {
    this.sweepExpiredLocks();
    const locks: ActiveLock[] = [];
    for (const st of this.seatStatuses.values()) {
      if (!this.isActiveHold(st)) continue;
      const show = this.shows.get(st.show_id);
      const layout = (this.seatLayouts.get(show?.screen_id || '') || []).find(l => l.id === st.seat_layout_id);
      locks.push({
        showId: st.show_id,
        seatLayoutId: st.seat_layout_id,
        seatLabel: `${layout?.row_label}-${layout?.seat_number}`,
        lockedBy: st.locked_by,
        expiresAt: st.lock_expires_at!,
        movieTitle: show ? this.movies.get(show.movie_id)?.title || 'Unknown Movie' : 'Unknown Movie',
        screenName: show ? this.screens.get(show.screen_id)?.name || 'Standard Screen' : 'Standard Screen',
        showDate: show?.show_date || '',
        showTime: show?.show_time || '',
      });
    }
    return locks;
  }

  public async getShowOccupancy(showIds: string[]): Promise<Record<string, { total: number; booked: number }>> {
    const result: Record<string, { total: number; booked: number }> = {};
    for (const id of showIds) {
      const seats = Array.from(this.seatStatuses.values()).filter(st => st.show_id === id);
      result[id] = { total: seats.length, booked: seats.filter(st => st.status === 'booked').length };
    }
    return result;
  }

  // ── BOOKING MANAGEMENT ─────────────────────────────────────
  // Mirrors public.create_pending_booking() in supabase/migrations/004_abuse_and_performance.sql
  public async createPendingBooking(params: Parameters<DatabaseClient['createPendingBooking']>[0]): Promise<PendingBookingResult> {
    const { showId, userId, holdOwner, channel, name, phone, email, idempotencyKey, holdSeconds } = params;
    const ids = Array.from(new Set(params.seatLayoutIds)).sort();
    const invalid: PendingBookingResult = { status: 'invalid', booking: null, holdExpiresAt: null };
    if (!holdOwner || ids.length === 0 || ids.length > 10) return invalid;

    const show = this.shows.get(showId);
    if (!show) return invalid;
    if (new Date(`${show.show_date}T${show.show_time}+05:30`).getTime() < Date.now()) {
      return { status: 'show_started', booking: null, holdExpiresAt: null };
    }

    let existing = Array.from(this.bookings.values()).find(b => b.client_idempotency_key === idempotencyKey);
    if (existing && existing.hold_owner !== holdOwner) return invalid;
    if (existing?.payment_status === 'paid') return { status: 'existing', booking: existing, holdExpiresAt: null };

    const holdExpiresAt = await this.extendSeatHolds(showId, ids, holdOwner, holdSeconds);
    if (!holdExpiresAt) return { status: 'hold_expired', booking: null, holdExpiresAt: null };
    if (existing) return { status: 'existing', booking: existing, holdExpiresAt };

    const seatKey = (bookingId: string) =>
      this.bookingSeats.filter(bs => bs.booking_id === bookingId).map(bs => bs.seat_layout_id).sort().join(',');
    existing = Array.from(this.bookings.values()).find(b =>
      b.hold_owner === holdOwner && b.show_id === showId && b.booking_channel === channel &&
      b.payment_status === 'pending' && Date.now() - new Date(b.created_at).getTime() < 30 * 60 * 1000 &&
      seatKey(b.id) === ids.join(','));
    if (existing) {
      Object.assign(existing, { customer_name: name, customer_phone: phone, customer_email: email });
      return { status: 'existing', booking: existing, holdExpiresAt };
    }

    const layouts = this.seatLayouts.get(show.screen_id) || [];
    const items = ids.map(id => layouts.find(l => l.id === id));
    if (items.some(l => !l)) return invalid;
    const priced = items.map(l => ({
      seat_layout_id: l!.id,
      price: Number(l!.category === 'premium' ? show.price_premium : show.price_classic ?? 150),
    }));

    const booking: Booking = {
      id: Math.random().toString(36).substring(2, 9),
      show_id: showId,
      booked_by: userId,
      booking_channel: channel,
      customer_name: name,
      customer_phone: phone,
      customer_email: email,
      total_amount: priced.reduce((sum, i) => sum + i.price, 0),
      payment_status: 'pending',
      razorpay_order_id: null,
      razorpay_payment_id: null,
      client_idempotency_key: idempotencyKey,
      qr_code_token: null,
      created_at: new Date().toISOString(),
      hold_owner: holdOwner,
      access_key: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
      paid_at: null,
      ticket_email_sent_at: null,
    };
    this.bookings.set(booking.id, booking);
    priced.forEach(item => this.bookingSeats.push({ booking_id: booking.id, ...item }));
    return { status: 'ok', booking, holdExpiresAt };
  }

  public async setBookingOrderId(bookingId: string, orderId: string): Promise<void> {
    const booking = this.bookings.get(bookingId);
    if (booking) booking.razorpay_order_id = orderId;
  }

  // Mirrors public.finalize_payment() in supabase/migrations/002_launch_hardening.sql
  public async finalizePayment(
    bookingId: string,
    paymentId: string,
    qrToken: string,
    conflictStatus: 'refund_pending' | 'failed'
  ): Promise<FinalizeResult> {
    this.sweepExpiredLocks();
    const booking = this.bookings.get(bookingId);
    if (!booking) return 'not_found';
    if (booking.payment_status === 'paid') return 'already_paid';
    if (booking.payment_status === 'refund_pending' || booking.payment_status === 'refunded') return 'refunding';

    const ids = this.bookingSeats.filter(bs => bs.booking_id === bookingId).map(bs => bs.seat_layout_id);
    const seats = ids.map(id => this.seatStatuses.get(`${booking.show_id}:${id}`));
    const allOurs = ids.length > 0 && seats.every(st => st && (
      (st.status === 'booked' && st.booking_id === bookingId) ||
      st.status === 'available' ||
      (st.status === 'locked' && (!this.isActiveHold(st) || st.locked_by === booking.hold_owner))
    ));

    if (allOurs) {
      ids.forEach((id) => {
        const key = `${booking.show_id}:${id}`;
        const st = this.seatStatuses.get(key)!;
        this.clearHold(key, st);
        st.status = 'booked';
        st.booking_id = bookingId;
      });
      booking.payment_status = 'paid';
      booking.razorpay_payment_id = paymentId;
      booking.qr_code_token = booking.qr_code_token || qrToken;
      booking.paid_at = new Date().toISOString();
      return 'confirmed';
    }

    booking.payment_status = conflictStatus;
    booking.razorpay_payment_id = paymentId;
    if (conflictStatus === 'refund_pending') booking.refund_reason = 'seats_unavailable';
    return 'conflict';
  }

  public async expirePendingBooking(bookingId: string): Promise<boolean> {
    const booking = this.bookings.get(bookingId);
    if (!booking || booking.payment_status !== 'pending') return false;
    booking.payment_status = 'failed';
    return true;
  }

  public async queueRefund(bookingId: string, paymentId: string, reason: string): Promise<boolean> {
    const booking = this.bookings.get(bookingId);
    if (!booking || (booking.payment_status !== 'pending' && booking.payment_status !== 'failed')) return false;
    booking.payment_status = 'refund_pending';
    booking.razorpay_payment_id = paymentId;
    booking.refund_reason = reason;
    return true;
  }

  public async claimRefund(bookingId: string): Promise<Booking | null> {
    const booking = this.bookings.get(bookingId);
    return booking && booking.payment_status === 'refund_pending' ? booking : null;
  }

  public async completeRefund(bookingId: string, refundId: string | null): Promise<void> {
    const booking = this.bookings.get(bookingId);
    if (booking && booking.payment_status === 'refund_pending') {
      booking.payment_status = 'refunded';
      booking.razorpay_refund_id = refundId;
    }
  }

  public async getPendingOnlineBookings(olderThanSeconds: number, limit: number): Promise<Booking[]> {
    const cutoff = Date.now() - olderThanSeconds * 1000;
    return Array.from(this.bookings.values())
      .filter(b => b.payment_status === 'pending' && b.booking_channel === 'online' && new Date(b.created_at).getTime() < cutoff)
      .slice(0, limit);
  }

  public async getRefundPendingBookings(limit: number): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(b => b.payment_status === 'refund_pending').slice(0, limit);
  }

  public async hasProcessedWebhookEvent(eventId: string): Promise<boolean> {
    return this.processedWebhookEvents.has(eventId);
  }

  public async recordWebhookEvent(eventId: string): Promise<void> {
    this.processedWebhookEvents.add(eventId);
  }

  public async claimTicketEmail(bookingId: string): Promise<boolean> {
    const booking = this.bookings.get(bookingId);
    return !!booking && booking.payment_status === 'paid' && !booking.ticket_email_sent_at;
  }

  public async markTicketEmailSent(bookingId: string): Promise<void> {
    const booking = this.bookings.get(bookingId);
    if (booking) booking.ticket_email_sent_at = new Date().toISOString();
  }

  public async getUnsentTicketEmailBookings(limit: number): Promise<Booking[]> {
    return Array.from(this.bookings.values())
      .filter(b => b.payment_status === 'paid' && !b.ticket_email_sent_at)
      .slice(0, limit);
  }

  public async rateLimitHit(key: string, windowSeconds: number, limit: number): Promise<boolean> {
    const windowKey = `${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const hits = (this.rateLimits.get(windowKey) || 0) + 1;
    this.rateLimits.set(windowKey, hits);
    return hits <= limit;
  }

  public async getSalesSummary(): Promise<SalesSummary> {
    const paid = Array.from(this.bookings.values()).filter(b => b.payment_status === 'paid');
    const paidIds = new Set(paid.map(b => b.id));
    return {
      paidRevenue: paid.reduce((sum, b) => sum + Number(b.total_amount), 0),
      paidBookings: paid.length,
      ticketsSold: this.bookingSeats.filter(bs => paidIds.has(bs.booking_id)).length,
      refundsPending: Array.from(this.bookings.values()).filter(b => b.payment_status === 'refund_pending').length,
    };
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

  public async getBookingByOrderId(orderId: string): Promise<Booking | null> {
    const match = Array.from(this.bookings.values()).find(b => b.razorpay_order_id === orderId);
    return match ? this.getBookingById(match.id) : null;
  }

  public async findPaidBookingsByPhone(phoneDigits: string, limit: number): Promise<Booking[]> {
    const matches = Array.from(this.bookings.values())
      .filter(b => b.payment_status === 'paid' && (b.customer_phone || '').replace(/\D/g, '').endsWith(phoneDigits))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
    const list: Booking[] = [];
    for (const b of matches) {
      const full = await this.getBookingById(b.id);
      if (full) list.push(full);
    }
    return list;
  }

  public async getBookingByQrToken(token: string): Promise<Booking | null> {
    const match = Array.from(this.bookings.values()).find(b => b.qr_code_token === token);
    return match ? this.getBookingById(match.id) : null;
  }

  public async searchPaidBookings(query: { phoneDigits: string } | { name: string }, limit: number): Promise<Booking[]> {
    const matches = Array.from(this.bookings.values())
      .filter(b => b.payment_status === 'paid')
      .filter(b => 'phoneDigits' in query
        ? (b.customer_phone || '').replace(/\D/g, '').includes(query.phoneDigits)
        : (b.customer_name || '').toLowerCase().includes(query.name.toLowerCase()))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);

    const list: Booking[] = [];
    for (const b of matches) {
      const full = await this.getBookingById(b.id);
      if (full) list.push(full);
    }
    return list;
  }

  public async getPaidBookingsForShowDate(showDate: string, limit: number): Promise<Booking[]> {
    const matches = Array.from(this.bookings.values())
      .filter(b => b.payment_status === 'paid' && this.shows.get(b.show_id)?.show_date === showDate)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);

    const list: Booking[] = [];
    for (const b of matches) {
      const full = await this.getBookingById(b.id);
      if (full) list.push(full);
    }
    return list;
  }

  public async checkInBooking(bookingId: string, staffId: string | null): Promise<boolean> {
    const booking = this.bookings.get(bookingId);
    if (!booking || booking.payment_status !== 'paid' || booking.checked_in_at) return false;
    booking.checked_in_at = new Date().toISOString();
    booking.checked_in_by = staffId;
    return true;
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

  public async getProfileByEmail(email: string): Promise<Profile | null> {
    const target = email.toLowerCase().trim();
    for (const profile of this.profiles.values()) {
      if (profile.email && profile.email.toLowerCase().trim() === target) {
        return profile;
      }
    }
    return null;
  }

  public async createProfile(id: string, fullName: string, phone: string, role: Profile['role'] = 'user', email?: string): Promise<Profile> {
    const newProfile: Profile = {
      id,
      email,
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

  public async getMembers(): Promise<Profile[]> {
    return Array.from(this.profiles.values()).filter(p => p.role === 'member');
  }

  public async onboardMember(email: string, fullName: string, phone: string): Promise<Profile> {
    const id = `member-${Math.random().toString(36).substring(2, 9)}`;
    const newMember: Profile = {
      id,
      email,
      full_name: fullName,
      phone,
      role: 'member',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.profiles.set(id, newMember);
    return newMember;
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

  public async getAuditLogs(limit: number): Promise<AuditLog[]> {
    return [...this.auditLogs].reverse().slice(0, limit);
  }
}

