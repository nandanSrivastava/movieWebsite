-- ============================================================
-- DHRUB TALKIES — 002 LAUNCH HARDENING
-- Paste into: Supabase Dashboard → SQL Editor → New Query → RUN ▶
-- Run after 001_gate_checkin.sql. Safe to run more than once.
--
-- What it does:
--   • Seat/booking functions can only be called by the server
--     (service role), never with the public anon key.
--   • Seat holds: per-guest and per-IP caps, fixed hold length,
--     re-selecting your own seats works.
--   • One atomic finalize_payment() for webhook / verify / cron.
--   • Refund queue, ticket-email outbox, secret ticket links.
--   • Durable rate limits, admin aggregates, tighter RLS.
-- ============================================================

-- ── 1. BOOKINGS: new states and columns ─────────────────────
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refund_pending', 'refunded'));

ALTER TABLE public.bookings
  -- Seat-hold identity this booking consumes (logged-in user id, guest id, or cashier id)
  ADD COLUMN IF NOT EXISTS hold_owner UUID,
  -- Secret part of the ticket link; only the buyer (and their email) has it
  ADD COLUMN IF NOT EXISTS access_key TEXT NOT NULL
    DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  -- Refund queue
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS refund_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  -- Ticket email outbox
  ADD COLUMN IF NOT EXISTS ticket_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ticket_email_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ticket_email_locked_until TIMESTAMPTZ;

-- Bookings paid before this migration already had their email sent
UPDATE public.bookings
SET ticket_email_sent_at = COALESCE(ticket_email_sent_at, created_at),
    paid_at = COALESCE(paid_at, created_at)
WHERE payment_status = 'paid' AND ticket_email_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_order_id ON public.bookings(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_bookings_phone_digits ON public.bookings(customer_phone_digits);
CREATE INDEX IF NOT EXISTS idx_bookings_needs_work ON public.bookings(created_at)
  WHERE payment_status IN ('pending', 'refund_pending');
CREATE INDEX IF NOT EXISTS idx_bookings_unsent_email ON public.bookings(paid_at)
  WHERE payment_status = 'paid' AND ticket_email_sent_at IS NULL;

-- ── 2. SEAT STATUS: remember the IP behind each hold ────────
ALTER TABLE public.seat_status ADD COLUMN IF NOT EXISTS locked_ip TEXT;
CREATE INDEX IF NOT EXISTS idx_seat_status_active_locks ON public.seat_status(lock_expires_at)
  WHERE status = 'locked';
CREATE INDEX IF NOT EXISTS idx_seat_status_locked_ip ON public.seat_status(locked_ip)
  WHERE status = 'locked';

-- ── 3. RATE LIMITS (shared across all server instances) ─────
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits         INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- ── 4. FUNCTIONS ────────────────────────────────────────────
-- Old signatures: confirm_booking is replaced by finalize_payment, and the old
-- lock_seats let the caller choose the hold length and seat cap.
DROP FUNCTION IF EXISTS public.confirm_booking(UUID, UUID, UUID[], UUID);
DROP FUNCTION IF EXISTS public.lock_seats(UUID, UUID[], UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.lock_seats(UUID, UUID[], UUID, INTEGER);

-- lock_seats(): hold seats for one owner. Returns
--   'ok' | 'taken' | 'owner_cap' | 'ip_cap' | 'invalid'
-- Re-locking seats you already hold refreshes them; picking a different set on
-- the same show releases your other holds on that show.
CREATE OR REPLACE FUNCTION public.lock_seats(
  p_show_id         UUID,
  p_seat_layout_ids UUID[],
  p_owner           UUID,
  p_client_ip       TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c_hold          CONSTANT INTERVAL := INTERVAL '8 minutes';
  c_max_per_owner CONSTANT INTEGER  := 10;
  c_max_per_ip    CONSTANT INTEGER  := 24;
  v_ids           UUID[];
  v_found         INTEGER;
  v_blocked       INTEGER;
  v_owner_held    INTEGER;
  v_ip_held       INTEGER;
BEGIN
  SELECT array_agg(DISTINCT id) INTO v_ids FROM unnest(p_seat_layout_ids) AS id;
  IF p_owner IS NULL OR v_ids IS NULL OR cardinality(v_ids) > c_max_per_owner THEN
    RETURN 'invalid';
  END IF;

  -- Row-lock the requested seats; NOWAIT so a concurrent checkout of the same
  -- seat fails fast instead of queueing
  BEGIN
    PERFORM 1 FROM public.seat_status
    WHERE show_id = p_show_id AND seat_layout_id = ANY(v_ids)
    ORDER BY seat_layout_id
    FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RETURN 'taken';
  END;

  SELECT count(*),
         count(*) FILTER (WHERE status = 'booked'
                             OR (status = 'locked' AND lock_expires_at > NOW()
                                 AND locked_by IS DISTINCT FROM p_owner))
    INTO v_found, v_blocked
  FROM public.seat_status
  WHERE show_id = p_show_id AND seat_layout_id = ANY(v_ids);

  IF v_found <> cardinality(v_ids) THEN RETURN 'invalid'; END IF;
  IF v_blocked > 0 THEN RETURN 'taken'; END IF;

  -- Caps: this request replaces the owner's holds on this show
  SELECT count(*) INTO v_owner_held
  FROM public.seat_status
  WHERE locked_by = p_owner AND status = 'locked' AND lock_expires_at > NOW()
    AND show_id <> p_show_id;
  IF v_owner_held + cardinality(v_ids) > c_max_per_owner THEN RETURN 'owner_cap'; END IF;

  IF p_client_ip IS NOT NULL THEN
    SELECT count(*) INTO v_ip_held
    FROM public.seat_status
    WHERE locked_ip = p_client_ip AND status = 'locked' AND lock_expires_at > NOW()
      AND NOT (show_id = p_show_id AND locked_by = p_owner);
    IF v_ip_held + cardinality(v_ids) > c_max_per_ip THEN RETURN 'ip_cap'; END IF;
  END IF;

  UPDATE public.seat_status
  SET status = 'available', locked_by = NULL, locked_ip = NULL, locked_at = NULL, lock_expires_at = NULL
  WHERE show_id = p_show_id AND locked_by = p_owner AND status = 'locked'
    AND NOT (seat_layout_id = ANY(v_ids));

  UPDATE public.seat_status
  SET status = 'locked', locked_by = p_owner, locked_ip = p_client_ip,
      locked_at = NOW(), lock_expires_at = NOW() + c_hold
  WHERE show_id = p_show_id AND seat_layout_id = ANY(v_ids);

  RETURN 'ok';
END;
$$;

-- extend_seat_holds(): push the owner's holds out (checkout in progress).
-- Returns the new expiry, or NULL if the owner no longer holds every seat.
CREATE OR REPLACE FUNCTION public.extend_seat_holds(
  p_show_id         UUID,
  p_seat_layout_ids UUID[],
  p_owner           UUID,
  p_seconds         INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ids     UUID[];
  v_expires TIMESTAMPTZ := NOW() + make_interval(secs => LEAST(GREATEST(p_seconds, 60), 1200));
  v_count   INTEGER;
BEGIN
  SELECT array_agg(DISTINCT id) INTO v_ids FROM unnest(p_seat_layout_ids) AS id;
  IF p_owner IS NULL OR v_ids IS NULL THEN RETURN NULL; END IF;

  UPDATE public.seat_status
  SET lock_expires_at = GREATEST(lock_expires_at, v_expires)
  WHERE show_id = p_show_id AND seat_layout_id = ANY(v_ids)
    AND locked_by = p_owner AND status = 'locked' AND lock_expires_at > NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> cardinality(v_ids) THEN RETURN NULL; END IF;
  RETURN v_expires;
END;
$$;

-- finalize_payment(): the ONLY way a booking becomes paid. Row-locks the
-- booking, so the webhook, the browser fallback and the reconcile job can race
-- safely: the first one confirms, the rest see 'already_paid'. Seats count as
-- ours if already booked by this booking, free, held by this booking's owner,
-- or held by anyone whose hold has expired. Returns
--   'confirmed' | 'already_paid' | 'refunding' | 'conflict' | 'not_found'
-- On 'conflict' the booking moves to p_conflict_status ('refund_pending' for
-- online payments that must be refunded, 'failed' for an unpaid cash sale).
CREATE OR REPLACE FUNCTION public.finalize_payment(
  p_booking_id      UUID,
  p_payment_id      TEXT,
  p_qr_token        TEXT,
  p_conflict_status TEXT DEFAULT 'refund_pending'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_ids     UUID[];
  v_found   INTEGER;
  v_blocked INTEGER;
BEGIN
  IF p_conflict_status NOT IN ('refund_pending', 'failed') THEN
    RAISE EXCEPTION 'invalid conflict status %', p_conflict_status;
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_booking.payment_status = 'paid' THEN RETURN 'already_paid'; END IF;
  IF v_booking.payment_status IN ('refund_pending', 'refunded') THEN RETURN 'refunding'; END IF;

  SELECT array_agg(seat_layout_id ORDER BY seat_layout_id) INTO v_ids
  FROM public.booking_seats WHERE booking_id = p_booking_id;

  IF v_ids IS NOT NULL THEN
    PERFORM 1 FROM public.seat_status
    WHERE show_id = v_booking.show_id AND seat_layout_id = ANY(v_ids)
    ORDER BY seat_layout_id
    FOR UPDATE;

    SELECT count(*),
           count(*) FILTER (WHERE NOT (
                (status = 'booked' AND booking_id = p_booking_id)
             OR status = 'available'
             OR (status = 'locked' AND (
                  lock_expires_at IS NULL
               OR lock_expires_at <= NOW()
               OR locked_by = v_booking.hold_owner
               OR (v_booking.hold_owner IS NULL AND locked_by = v_booking.booked_by)))))
      INTO v_found, v_blocked
    FROM public.seat_status
    WHERE show_id = v_booking.show_id AND seat_layout_id = ANY(v_ids);

    IF v_found = cardinality(v_ids) AND v_blocked = 0 THEN
      UPDATE public.seat_status
      SET status = 'booked', booking_id = p_booking_id,
          locked_by = NULL, locked_ip = NULL, locked_at = NULL, lock_expires_at = NULL
      WHERE show_id = v_booking.show_id AND seat_layout_id = ANY(v_ids);

      UPDATE public.bookings
      SET payment_status = 'paid',
          razorpay_payment_id = p_payment_id,
          qr_code_token = COALESCE(qr_code_token, p_qr_token),
          paid_at = NOW()
      WHERE id = p_booking_id;

      RETURN 'confirmed';
    END IF;
  END IF;

  UPDATE public.bookings
  SET payment_status = p_conflict_status,
      razorpay_payment_id = p_payment_id,
      refund_reason = CASE WHEN p_conflict_status = 'refund_pending' THEN 'seats_unavailable' ELSE refund_reason END
  WHERE id = p_booking_id;

  RETURN 'conflict';
END;
$$;

-- sweep_expired_locks(): also clears the hold IP
CREATE OR REPLACE FUNCTION public.sweep_expired_locks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.seat_status
  SET status = 'available', locked_by = NULL, locked_ip = NULL, locked_at = NULL, lock_expires_at = NULL
  WHERE status = 'locked' AND lock_expires_at IS NOT NULL AND lock_expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- rate_limit_hit(): fixed-window counter. TRUE = allowed, FALSE = over the limit.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key            TEXT,
  p_window_seconds INTEGER,
  p_limit          INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_window TIMESTAMPTZ := to_timestamp(floor(extract(epoch FROM NOW()) / p_window_seconds) * p_window_seconds);
  v_hits   INTEGER;
BEGIN
  INSERT INTO public.rate_limits (key, window_start, hits)
  VALUES (p_key, v_window, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = public.rate_limits.hits + 1
  RETURNING hits INTO v_hits;

  RETURN v_hits <= p_limit;
END;
$$;

-- show_occupancy(): booked / total seats per show, counted in the database
CREATE OR REPLACE FUNCTION public.show_occupancy(p_show_ids UUID[])
RETURNS TABLE (show_id UUID, total_seats BIGINT, booked_seats BIGINT)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.show_id, count(*), count(*) FILTER (WHERE s.status = 'booked')
  FROM public.seat_status s
  WHERE s.show_id = ANY(p_show_ids)
  GROUP BY s.show_id;
$$;

-- admin_sales_summary(): dashboard totals from bookings, not from audit logs
CREATE OR REPLACE FUNCTION public.admin_sales_summary()
RETURNS TABLE (paid_revenue NUMERIC, paid_bookings BIGINT, tickets_sold BIGINT, refunds_pending BIGINT)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(sum(b.total_amount) FILTER (WHERE b.payment_status = 'paid'), 0),
    count(*) FILTER (WHERE b.payment_status = 'paid'),
    (SELECT count(*) FROM public.booking_seats bs
       JOIN public.bookings pb ON pb.id = bs.booking_id
      WHERE pb.payment_status = 'paid'),
    count(*) FILTER (WHERE b.payment_status = 'refund_pending')
  FROM public.bookings b;
$$;

-- Existing helpers: pin search_path on SECURITY DEFINER functions
ALTER FUNCTION public.is_staff() SET search_path = public;
ALTER FUNCTION public.is_admin() SET search_path = public;

-- ── 5. WHO MAY CALL WHAT ────────────────────────────────────
-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default. These must only ever run from the server (service role).
REVOKE ALL ON FUNCTION public.lock_seats(UUID, UUID[], UUID, TEXT)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.extend_seat_holds(UUID, UUID[], UUID, INTEGER)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_payment(UUID, TEXT, TEXT, TEXT)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sweep_expired_locks()                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.show_occupancy(UUID[])                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_sales_summary()                             FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lock_seats(UUID, UUID[], UUID, TEXT)           TO service_role;
GRANT EXECUTE ON FUNCTION public.extend_seat_holds(UUID, UUID[], UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_payment(UUID, TEXT, TEXT, TEXT)       TO service_role;
GRANT EXECUTE ON FUNCTION public.sweep_expired_locks()                          TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER)         TO service_role;
GRANT EXECUTE ON FUNCTION public.show_occupancy(UUID[])                         TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_sales_summary()                          TO service_role;

-- ── 6. TABLE ACCESS FOR THE PUBLIC ANON KEY ─────────────────
-- All writes go through the server's service role. Remove direct write paths.
DROP POLICY IF EXISTS "seat_status: staff write" ON public.seat_status;
DROP POLICY IF EXISTS "bookings: staff update"   ON public.bookings;

REVOKE INSERT, UPDATE, DELETE ON public.seat_status, public.bookings, public.booking_seats,
  public.audit_logs, public.processed_webhook_events, public.rate_limits
  FROM anon, authenticated;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

-- Seat map is public, but who holds a seat and which booking bought it are not
REVOKE SELECT ON public.seat_status FROM anon, authenticated;
GRANT SELECT (id, show_id, seat_layout_id, status, lock_expires_at) ON public.seat_status TO anon, authenticated;

-- A profile created by the user themselves can only ever be a plain user
DROP POLICY IF EXISTS "profiles: insert own" ON public.profiles;
CREATE POLICY "profiles: insert own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id AND role = 'user');
