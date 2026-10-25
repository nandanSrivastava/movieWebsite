-- ============================================================
-- DHRUB TALKIES — 004 ABUSE + PERFORMANCE FIXES
-- Paste into: Supabase Dashboard → SQL Editor → New Query → RUN ▶
-- Run after 003_scheduled_jobs.sql. Safe to run more than once.
--
-- Found by load/race testing:
--   • Seat-hold caps could be overshot by parallel requests
--     (60 guests on one IP held 28 seats against a cap of 24).
--   • A checkout key replayed by someone else returned the
--     original buyer's booking; every click made a new booking.
--   • Phone lookup and gate search scanned the whole table.
-- ============================================================

-- ── 1. lock_seats(): serialize per owner and per IP ─────────
-- Without these locks two parallel calls both pass the cap count
-- and both lock. Owner lock first, then IP, so no deadlocks.
-- Also refuses shows that have already started (IST), so the API
-- doesn't need a separate round trip to check the show time.
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
  v_starts_at     TIMESTAMPTZ;
  v_found         INTEGER;
  v_blocked       INTEGER;
  v_owner_held    INTEGER;
  v_ip_held       INTEGER;
BEGIN
  SELECT array_agg(DISTINCT id) INTO v_ids FROM unnest(p_seat_layout_ids) AS id;
  IF p_owner IS NULL OR v_ids IS NULL OR cardinality(v_ids) > c_max_per_owner THEN
    RETURN 'invalid';
  END IF;

  SELECT (show_date + show_time) AT TIME ZONE 'Asia/Kolkata' INTO v_starts_at
  FROM public.shows WHERE id = p_show_id;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF v_starts_at < NOW() THEN RETURN 'show_started'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hold-owner:' || p_owner::text, 0));
  IF p_client_ip IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('hold-ip:' || p_client_ip, 0));
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

-- ── 2. create_pending_booking(): one atomic checkout step ───
-- Replaces several separate API round trips. In one transaction:
-- the show must not have started, the caller must still hold every
-- seat (holds are extended for the payment window), prices come from
-- the database, and the booking plus its seats are written together.
-- A checkout key only ever returns the booking of the guest who made
-- it, and repeated clicks for the same seats reuse one pending booking.
-- Returns jsonb: { status: 'ok'|'existing'|'hold_expired'|'show_started'|'invalid',
--                  booking (row without internal columns), hold_expires_at }
CREATE OR REPLACE FUNCTION public.create_pending_booking(
  p_show_id         UUID,
  p_seat_layout_ids UUID[],
  p_user_id         UUID,
  p_hold_owner      UUID,
  p_channel         TEXT,
  p_name            TEXT,
  p_phone           TEXT,
  p_email           TEXT,
  p_idempotency_key TEXT,
  p_hold_seconds    INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ids        UUID[];
  v_show       public.shows%ROWTYPE;
  v_existing   public.bookings%ROWTYPE;
  v_expires    TIMESTAMPTZ;
  v_booking_id UUID;
  v_total      NUMERIC(10,2);
  v_priced     INTEGER;
BEGIN
  SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids FROM unnest(p_seat_layout_ids) AS id;
  IF p_hold_owner IS NULL OR v_ids IS NULL OR cardinality(v_ids) > 10
     OR p_channel NOT IN ('online', 'counter') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO v_show FROM public.shows WHERE id = p_show_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF (v_show.show_date + v_show.show_time) AT TIME ZONE 'Asia/Kolkata' < NOW() THEN
    RETURN jsonb_build_object('status', 'show_started');
  END IF;

  -- One checkout at a time per hold owner, and per checkout key (so a key
  -- replayed by someone else at the same instant is refused, not a 500)
  PERFORM pg_advisory_xact_lock(hashtextextended('checkout:' || p_hold_owner::text, 0));
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('checkout-key:' || p_idempotency_key, 0));
  END IF;

  -- Retried request: only ever hand back the caller's own booking
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.bookings WHERE client_idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_existing.hold_owner IS DISTINCT FROM p_hold_owner THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      IF v_existing.payment_status = 'paid' THEN
        RETURN jsonb_build_object('status', 'existing', 'hold_expires_at', NULL, 'booking', (SELECT to_jsonb(b) - 'client_idempotency_key' - 'hold_owner' FROM public.bookings b WHERE b.id = v_existing.id));
      END IF;
    END IF;
  END IF;

  v_expires := public.extend_seat_holds(p_show_id, v_ids, p_hold_owner, p_hold_seconds);
  IF v_expires IS NULL THEN
    RETURN jsonb_build_object('status', 'hold_expired');
  END IF;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'existing', 'hold_expires_at', v_expires, 'booking', (SELECT to_jsonb(b) - 'client_idempotency_key' - 'hold_owner' FROM public.bookings b WHERE b.id = v_existing.id));
  END IF;

  -- Same person, same show, same seats, still unpaid: reuse it
  SELECT b.* INTO v_existing
  FROM public.bookings b
  WHERE b.hold_owner = p_hold_owner AND b.show_id = p_show_id
    AND b.booking_channel = p_channel AND b.payment_status = 'pending'
    AND b.created_at > NOW() - INTERVAL '30 minutes'
    AND (SELECT array_agg(bs.seat_layout_id ORDER BY bs.seat_layout_id)
           FROM public.booking_seats bs WHERE bs.booking_id = b.id) = v_ids
  ORDER BY b.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.bookings
    SET customer_name = p_name, customer_phone = p_phone, customer_email = p_email
    WHERE id = v_existing.id;
    RETURN jsonb_build_object('status', 'existing', 'hold_expires_at', v_expires, 'booking', (SELECT to_jsonb(b) - 'client_idempotency_key' - 'hold_owner' FROM public.bookings b WHERE b.id = v_existing.id));
  END IF;

  -- Prices from the database; every seat must belong to this show
  SELECT count(*), sum(CASE WHEN sl.category = 'premium' THEN v_show.price_premium ELSE v_show.price_classic END)
    INTO v_priced, v_total
  FROM public.seat_status ss
  JOIN public.seat_layout sl ON sl.id = ss.seat_layout_id
  WHERE ss.show_id = p_show_id AND ss.seat_layout_id = ANY(v_ids);
  IF v_priced <> cardinality(v_ids) THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  INSERT INTO public.bookings (show_id, booked_by, hold_owner, booking_channel, customer_name,
                               customer_phone, customer_email, total_amount, payment_status, client_idempotency_key)
  VALUES (p_show_id, p_user_id, p_hold_owner, p_channel, p_name, p_phone, p_email, v_total, 'pending', p_idempotency_key)
  RETURNING id INTO v_booking_id;

  INSERT INTO public.booking_seats (booking_id, seat_layout_id, price)
  SELECT v_booking_id, sl.id, CASE WHEN sl.category = 'premium' THEN v_show.price_premium ELSE v_show.price_classic END
  FROM public.seat_layout sl WHERE sl.id = ANY(v_ids);

  RETURN jsonb_build_object('status', 'ok', 'hold_expires_at', v_expires, 'booking', (SELECT to_jsonb(b) - 'client_idempotency_key' - 'hold_owner' FROM public.bookings b WHERE b.id = v_booking_id));
END;
$$;

REVOKE ALL ON FUNCTION public.lock_seats(UUID, UUID[], UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_pending_booking(UUID, UUID[], UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_seats(UUID, UUID[], UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_pending_booking(UUID, UUID[], UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER)
  TO service_role;

-- ── 3. Search indexes ───────────────────────────────────────
-- "Find my tickets" matches the last 10 digits exactly (indexed),
-- instead of a suffix LIKE that scans every booking.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_phone_last10 TEXT
  GENERATED ALWAYS AS (right(regexp_replace(COALESCE(customer_phone, ''), '\D', '', 'g'), 10)) STORED;
CREATE INDEX IF NOT EXISTS idx_bookings_phone_last10 ON public.bookings(customer_phone_last10)
  WHERE payment_status = 'paid';

-- Gate search by partial phone / name: trigram indexes
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS idx_bookings_phone_trgm ON public.bookings
  USING gin (customer_phone_digits extensions.gin_trgm_ops) WHERE payment_status = 'paid';
CREATE INDEX IF NOT EXISTS idx_bookings_name_trgm ON public.bookings
  USING gin (customer_name extensions.gin_trgm_ops) WHERE payment_status = 'paid';
