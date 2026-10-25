import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Movie, Screen, Show, SeatStatus, Booking, Profile, AuditLog, DatabaseClient,
  LockResult, FinalizeResult, SeatAvailability, SeatHold, ActiveLock, SalesSummary, PendingBookingResult
} from './types';

const BOOKING_FULL_SELECT =
  '*, show:shows(*, movie:movies(*), screen:screens(*)), booking_seats(seat_layout_id, price, seat_layout:seat_layout(*))';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Escapes LIKE wildcards so customer input is matched literally
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

// ── SUPABASE CLIENT DB IMPLEMENTATION ──────────────────────────
export class SupabaseDatabaseClient implements DatabaseClient {
  public isMock = false;
  private supabase: SupabaseClient;

  constructor() {
    // Server-side access needs the service role: the seat and payment
    // functions are not callable with the public anon key.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. The server cannot reach the database without it.');
    }
    this.supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
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
      let category = 'classic';
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

  public async getShows(fromDate?: string): Promise<Show[]> {
    return this.fetchWithRetry(() => {
      let query = this.supabase.from('shows').select('*, movie:movies(*), screen:screens(*)');
      if (fromDate) query = query.gte('show_date', fromDate);
      return query.order('show_date').order('show_time').limit(1000);
    });
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

  public async deleteShow(id: string): Promise<boolean> {
    const { error } = await this.supabase.from('shows').delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  public async getSeatsForShow(showId: string): Promise<SeatStatus[]> {
    if (!UUID_RE.test(showId)) return [];
    const { data, error } = await this.supabase
      .from('seat_status')
      .select('*, seat_layout:seat_layout(*)')
      .eq('show_id', showId);
    if (error) throw error;

    const now = new Date().toISOString();
    return (data as SeatStatus[]).map(seat => {
      if (seat.status === 'locked' && seat.lock_expires_at && seat.lock_expires_at < now) {
        return { ...seat, status: 'available', locked_by: null, locked_at: null, lock_expires_at: null };
      }
      return seat;
    });
  }

  public async getSeatAvailability(showId: string): Promise<SeatAvailability[]> {
    if (!UUID_RE.test(showId)) return [];
    // Hot path (polled by every open seat map): one query, no retries
    const { data, error } = await this.supabase
      .from('seat_status')
      .select('seat_layout_id, status, lock_expires_at')
      .eq('show_id', showId);
    if (error) throw error;

    const now = new Date().toISOString();
    return (data || []).map((seat: any) => ({
      seat_layout_id: seat.seat_layout_id,
      status: seat.status === 'locked' && (!seat.lock_expires_at || seat.lock_expires_at < now) ? 'available' : seat.status,
    }));
  }

  public async getSeatHolds(showId: string, owner: string): Promise<SeatHold[]> {
    if (!UUID_RE.test(showId) || !UUID_RE.test(owner)) return [];
    const { data, error } = await this.supabase
      .from('seat_status')
      .select('seat_layout_id, lock_expires_at')
      .eq('show_id', showId)
      .eq('locked_by', owner)
      .eq('status', 'locked')
      .gt('lock_expires_at', new Date().toISOString());
    if (error) throw error;
    return data as SeatHold[];
  }

  public async lockSeats(showId: string, seatLayoutIds: string[], owner: string, clientIp: string | null): Promise<LockResult> {
    if (!UUID_RE.test(showId) || !UUID_RE.test(owner) || !seatLayoutIds.every(id => UUID_RE.test(id))) return 'invalid';
    const { data, error } = await this.supabase.rpc('lock_seats', {
      p_show_id: showId,
      p_seat_layout_ids: seatLayoutIds,
      p_owner: owner,
      p_client_ip: clientIp,
    });
    if (error) throw error;
    return data as LockResult;
  }

  public async extendSeatHolds(showId: string, seatLayoutIds: string[], owner: string, seconds: number): Promise<string | null> {
    if (!UUID_RE.test(showId) || !UUID_RE.test(owner) || !seatLayoutIds.every(id => UUID_RE.test(id))) return null;
    const { data, error } = await this.supabase.rpc('extend_seat_holds', {
      p_show_id: showId,
      p_seat_layout_ids: seatLayoutIds,
      p_owner: owner,
      p_seconds: seconds,
    });
    if (error) throw error;
    return data;
  }

  public async releaseSeatHolds(showId: string, seatLayoutIds: string[], owner: string): Promise<void> {
    if (!UUID_RE.test(showId) || !UUID_RE.test(owner)) return;
    const { error } = await this.supabase
      .from('seat_status')
      .update({ status: 'available', locked_by: null, locked_ip: null, locked_at: null, lock_expires_at: null })
      .eq('show_id', showId)
      .in('seat_layout_id', seatLayoutIds)
      .eq('locked_by', owner)
      .eq('status', 'locked');
    if (error) throw error;
  }

  public async forceReleaseSeatHolds(showId: string, seatLayoutIds: string[]): Promise<void> {
    if (!UUID_RE.test(showId)) return;
    // Only ever releases holds; a booked (sold) seat is never touched
    const { error } = await this.supabase
      .from('seat_status')
      .update({ status: 'available', locked_by: null, locked_ip: null, locked_at: null, lock_expires_at: null })
      .eq('show_id', showId)
      .in('seat_layout_id', seatLayoutIds)
      .eq('status', 'locked');
    if (error) throw error;
  }

  public async getActiveLocks(): Promise<ActiveLock[]> {
    const { data, error } = await this.supabase
      .from('seat_status')
      .select('show_id, seat_layout_id, locked_by, lock_expires_at, seat_layout:seat_layout(row_label, seat_number), show:shows(show_date, show_time, movie:movies(title), screen:screens(name))')
      .eq('status', 'locked')
      .gt('lock_expires_at', new Date().toISOString())
      .order('lock_expires_at')
      .limit(500);
    if (error) throw error;

    return (data || []).map((row: any) => ({
      showId: row.show_id,
      seatLayoutId: row.seat_layout_id,
      seatLabel: `${row.seat_layout?.row_label}-${row.seat_layout?.seat_number}`,
      lockedBy: row.locked_by,
      expiresAt: row.lock_expires_at,
      movieTitle: row.show?.movie?.title || 'Unknown Movie',
      screenName: row.show?.screen?.name || 'Standard Screen',
      showDate: row.show?.show_date,
      showTime: row.show?.show_time,
    }));
  }

  public async getShowOccupancy(showIds: string[]): Promise<Record<string, { total: number; booked: number }>> {
    const ids = showIds.filter(id => UUID_RE.test(id));
    if (ids.length === 0) return {};
    const { data, error } = await this.supabase.rpc('show_occupancy', { p_show_ids: ids });
    if (error) throw error;

    const result: Record<string, { total: number; booked: number }> = {};
    for (const row of data || []) {
      result[row.show_id] = { total: Number(row.total_seats), booked: Number(row.booked_seats) };
    }
    return result;
  }

  public async createPendingBooking(params: Parameters<DatabaseClient['createPendingBooking']>[0]): Promise<PendingBookingResult> {
    const { showId, seatLayoutIds, userId, holdOwner, channel, name, phone, email, idempotencyKey, holdSeconds } = params;
    if (!UUID_RE.test(showId) || !UUID_RE.test(holdOwner) || !seatLayoutIds.every(id => UUID_RE.test(id))) {
      return { status: 'invalid', booking: null, holdExpiresAt: null };
    }
    const { data, error } = await this.supabase.rpc('create_pending_booking', {
      p_show_id: showId,
      p_seat_layout_ids: seatLayoutIds,
      p_user_id: userId,
      p_hold_owner: holdOwner,
      p_channel: channel,
      p_name: name,
      p_phone: phone,
      p_email: email,
      p_idempotency_key: idempotencyKey,
      p_hold_seconds: holdSeconds,
    });
    if (error) throw error;
    return { status: data.status, booking: data.booking ?? null, holdExpiresAt: data.hold_expires_at ?? null };
  }

  public async setBookingOrderId(bookingId: string, orderId: string): Promise<void> {
    const { error } = await this.supabase.from('bookings').update({ razorpay_order_id: orderId }).eq('id', bookingId);
    if (error) throw error;
  }

  public async getBookingById(id: string): Promise<Booking | null> {
    // bookings.id is a UUID column; anything else would fail the cast in Postgres
    if (!UUID_RE.test(id)) return null;

    const { data, error } = await this.supabase
      .from('bookings')
      .select(BOOKING_FULL_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  public async getBookingByOrderId(orderId: string): Promise<Booking | null> {
    const { data, error } = await this.supabase
      .from('bookings')
      .select(BOOKING_FULL_SELECT)
      .eq('razorpay_order_id', orderId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  public async findPaidBookingsByPhone(phoneDigits: string, limit: number): Promise<Booking[]> {
    // Stored numbers may carry a 91 / 0 prefix; customer_phone_last10 (indexed)
    // holds the subscriber number
    const { data, error } = await this.supabase
      .from('bookings')
      .select(BOOKING_FULL_SELECT)
      .eq('payment_status', 'paid')
      .eq('customer_phone_last10', phoneDigits.slice(-10))
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  public async finalizePayment(
    bookingId: string,
    paymentId: string,
    qrToken: string,
    conflictStatus: 'refund_pending' | 'failed'
  ): Promise<FinalizeResult> {
    if (!UUID_RE.test(bookingId)) return 'not_found';
    const { data, error } = await this.supabase.rpc('finalize_payment', {
      p_booking_id: bookingId,
      p_payment_id: paymentId,
      p_qr_token: qrToken,
      p_conflict_status: conflictStatus,
    });
    if (error) throw error;
    return data as FinalizeResult;
  }

  public async expirePendingBooking(bookingId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('bookings')
      .update({ payment_status: 'failed' })
      .eq('id', bookingId)
      .eq('payment_status', 'pending')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  public async queueRefund(bookingId: string, paymentId: string, reason: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('bookings')
      .update({ payment_status: 'refund_pending', razorpay_payment_id: paymentId, refund_reason: reason })
      .eq('id', bookingId)
      .in('payment_status', ['pending', 'failed'])
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  public async claimRefund(bookingId: string): Promise<Booking | null> {
    // A short claim stops the webhook, the browser fallback and the cron job
    // from refunding the same payment at the same moment.
    const now = new Date();
    const { data: current, error: readErr } = await this.supabase
      .from('bookings')
      .select('refund_attempts')
      .eq('id', bookingId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!current) return null;

    const { data, error } = await this.supabase
      .from('bookings')
      .update({
        refund_locked_until: new Date(now.getTime() + 2 * 60 * 1000).toISOString(),
        refund_attempts: (current.refund_attempts || 0) + 1,
      })
      .eq('id', bookingId)
      .eq('payment_status', 'refund_pending')
      .or(`refund_locked_until.is.null,refund_locked_until.lt."${now.toISOString()}"`)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  public async completeRefund(bookingId: string, refundId: string | null): Promise<void> {
    const { error } = await this.supabase
      .from('bookings')
      .update({ payment_status: 'refunded', razorpay_refund_id: refundId, refunded_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('payment_status', 'refund_pending');
    if (error) throw error;
  }

  public async getPendingOnlineBookings(olderThanSeconds: number, limit: number): Promise<Booking[]> {
    const cutoff = new Date(Date.now() - olderThanSeconds * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('payment_status', 'pending')
      .eq('booking_channel', 'online')
      .lt('created_at', cutoff)
      .order('created_at')
      .limit(limit);
    if (error) throw error;
    return data;
  }

  public async getRefundPendingBookings(limit: number): Promise<Booking[]> {
    const { data, error } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('payment_status', 'refund_pending')
      .order('created_at')
      .limit(limit);
    if (error) throw error;
    return data;
  }

  public async hasProcessedWebhookEvent(eventId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('processed_webhook_events')
      .select('razorpay_event_id')
      .eq('razorpay_event_id', eventId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  public async recordWebhookEvent(eventId: string): Promise<void> {
    const { error } = await this.supabase
      .from('processed_webhook_events')
      .upsert({ razorpay_event_id: eventId }, { onConflict: 'razorpay_event_id', ignoreDuplicates: true });
    if (error) throw error;
  }

  public async claimTicketEmail(bookingId: string): Promise<boolean> {
    const now = new Date();
    const { data: current, error: readErr } = await this.supabase
      .from('bookings')
      .select('ticket_email_attempts')
      .eq('id', bookingId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!current || current.ticket_email_attempts >= 5) return false;

    const { data, error } = await this.supabase
      .from('bookings')
      .update({
        ticket_email_locked_until: new Date(now.getTime() + 2 * 60 * 1000).toISOString(),
        ticket_email_attempts: current.ticket_email_attempts + 1,
      })
      .eq('id', bookingId)
      .eq('payment_status', 'paid')
      .is('ticket_email_sent_at', null)
      .or(`ticket_email_locked_until.is.null,ticket_email_locked_until.lt."${now.toISOString()}"`)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  public async markTicketEmailSent(bookingId: string): Promise<void> {
    const { error } = await this.supabase
      .from('bookings')
      .update({ ticket_email_sent_at: new Date().toISOString() })
      .eq('id', bookingId);
    if (error) throw error;
  }

  public async getUnsentTicketEmailBookings(limit: number): Promise<Booking[]> {
    const { data, error } = await this.supabase
      .from('bookings')
      .select('id')
      .eq('payment_status', 'paid')
      .is('ticket_email_sent_at', null)
      .lt('ticket_email_attempts', 5)
      .order('paid_at')
      .limit(limit);
    if (error) throw error;
    return data as Booking[];
  }

  public async rateLimitHit(key: string, windowSeconds: number, limit: number): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('rate_limit_hit', {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_limit: limit,
    });
    if (error) throw error;
    return data;
  }

  public async getSalesSummary(): Promise<SalesSummary> {
    const { data, error } = await this.supabase.rpc('admin_sales_summary').single();
    if (error) throw error;
    const row = data as any;
    return {
      paidRevenue: Number(row.paid_revenue),
      paidBookings: Number(row.paid_bookings),
      ticketsSold: Number(row.tickets_sold),
      refundsPending: Number(row.refunds_pending),
    };
  }

  public async getBookingByQrToken(token: string): Promise<Booking | null> {
    const { data, error } = await this.supabase
      .from('bookings')
      .select(BOOKING_FULL_SELECT)
      .eq('qr_code_token', token)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  public async searchPaidBookings(query: { phoneDigits: string } | { name: string }, limit: number): Promise<Booking[]> {
    let request = this.supabase
      .from('bookings')
      .select(BOOKING_FULL_SELECT)
      .eq('payment_status', 'paid');

    request = 'phoneDigits' in query
      ? request.like('customer_phone_digits', `%${escapeLike(query.phoneDigits)}%`)
      : request.ilike('customer_name', `%${escapeLike(query.name)}%`);

    const { data, error } = await request.order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  }

  public async getPaidBookingsForShowDate(showDate: string, limit: number): Promise<Booking[]> {
    const shows = await this.getShowsForDate(showDate);
    if (shows.length === 0) return [];

    const { data, error } = await this.supabase
      .from('bookings')
      .select(BOOKING_FULL_SELECT)
      .eq('payment_status', 'paid')
      .in('show_id', shows.map((s) => s.id))
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  public async checkInBooking(bookingId: string, staffId: string | null): Promise<boolean> {
    // Atomic: only a paid booking that hasn't been admitted yet is updated,
    // so two gates scanning the same ticket can't both admit it.
    const { data, error } = await this.supabase
      .from('bookings')
      .update({ checked_in_at: new Date().toISOString(), checked_in_by: staffId })
      .eq('id', bookingId)
      .eq('payment_status', 'paid')
      .is('checked_in_at', null)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return !!data;
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

  public async getProfileByEmail(email: string): Promise<Profile | null> {
    try {
      const { data, error } = await this.supabase.from('profiles').select('*').eq('email', email.trim().toLowerCase()).maybeSingle();
      if (error && error.code !== 'PGRST116') return null;
      return data || null;
    } catch {
      return null;
    }
  }

  public async createProfile(id: string, fullName: string, phone: string, role: Profile['role'] = 'user', email?: string): Promise<Profile> {
    const payload: any = { id, full_name: fullName, phone, role };
    if (email) payload.email = email;

    let { data, error } = await this.supabase.from('profiles').insert(payload).select().single();
    if (error && error.message?.includes('email')) {
      delete payload.email;
      const res = await this.supabase.from('profiles').insert(payload).select().single();
      data = res.data ? { ...res.data, email } : null;
      error = res.error;
    }

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

  public async getMembers(): Promise<Profile[]> {
    const { data, error } = await this.supabase.from('profiles').select('*').eq('role', 'member').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  public async onboardMember(email: string, fullName: string, phone: string): Promise<Profile> {
    // Note: User Auth creation is handled by API route using Supabase Admin Auth API.
    const existingProfile = await this.getProfileByEmail(email);
    if (existingProfile) {
      return this.updateProfileRole(existingProfile.id, 'member');
    }
    const id = `member-${Math.random().toString(36).substring(2, 9)}`;
    return this.createProfile(id, fullName, phone, 'member', email);
  }

  public async logAudit(userId: string | null, action: string, details: any, ip?: string): Promise<void> {
    await this.supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      details,
      ip_address: ip || null
    });
  }

  public async getAuditLogs(limit: number): Promise<AuditLog[]> {
    const { data, error } = await this.supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  }
}

