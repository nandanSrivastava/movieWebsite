import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Movie, Screen, SeatLayout, Show, SeatStatus, Booking, Profile, AuditLog, DatabaseClient } from './types';

// ── SUPABASE CLIENT DB IMPLEMENTATION ──────────────────────────
export class SupabaseDatabaseClient implements DatabaseClient {
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
    const data = await this.fetchWithRetry(() => 
      this.supabase
        .from('seat_status')
        .select('*, seat_layout:seat_layout(*)')
        .eq('show_id', showId)
    );
    
    const now = new Date().toISOString();
    return (data as SeatStatus[]).map(seat => {
      if (seat.status === 'locked' && seat.lock_expires_at && seat.lock_expires_at < now) {
        return {
          ...seat,
          status: 'available',
          locked_by: null,
          locked_at: null,
          lock_expires_at: null
        };
      }
      return seat;
    });
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

