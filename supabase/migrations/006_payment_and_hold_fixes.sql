-- ============================================================
-- DHRUB TALKIES — 006 PAYMENT AND SEAT-HOLD FIXES
-- Paste into: Supabase Dashboard → SQL Editor → New Query → RUN ▶
-- Run after 005_profile_privacy.sql. Safe to run more than once.
--
-- RUN THIS BEFORE DEPLOYING the app version that needs it: the app
-- reads the new columns and calls the new functions.
--
-- Found by end-to-end testing:
--   • One hold could be extended forever by pressing Pay or Continue.
--   • Details corrected after closing the payment window were dropped,
--     so the ticket went to the mistyped email.
--   • A late payment on seats the customer had given up issued a second
--     ticket instead of a refund.
--   • A second tab's Continue cut a hold short during a payment.
--   • Signing in during checkout orphaned the guest's seats.
--   • Holding seats on one show blocked another show with no way out.
--   • A show with bookings could not be cancelled at all, and refunds
--     made in the Razorpay dashboard left the ticket valid.
--   • Staff could bulk-read every booking and ticket key with the
--     public key, and Add Movie failed where is_featured was missing.
-- ============================================================

-- Functions aren't checked against the tables until they run, so without this a
-- database missing an earlier migration would accept this file and then fail on
-- real customers.
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND (table_name, column_name) IN (
        ('bookings', 'hold_owner'), ('bookings', 'access_key'), ('bookings', 'refund_attempts'),
        ('bookings', 'ticket_email_attempts'), ('seat_status', 'locked_ip'))) <> 5 THEN
    RAISE EXCEPTION 'Run migrations 001 to 005 first: this database is missing columns they add. Nothing was changed.';
  END IF;
END $$;

-- ── 1. COLUMNS ──────────────────────────────────────────────
ALTER TABLE public.movies ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.shows ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE public.bookings
  -- The customer let these seats go; a late payment here is refunded
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  -- When the reconcile job last asked Razorpay, so every pending booking gets a turn
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  -- How many of its seats have come through the gate. checked_in_at is set once all have.
  ADD COLUMN IF NOT EXISTS admitted_seats INTEGER NOT NULL DEFAULT 0;

-- Refund notice outbox. Refunds made before this migration are not announced now.
-- Only the first time: on a re-run, a refund still waiting for its notice must keep waiting.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'refund_email_sent_at'
  ) THEN
    ALTER TABLE public.bookings ADD COLUMN refund_email_sent_at TIMESTAMPTZ;
    UPDATE public.bookings
    SET refund_email_sent_at = COALESCE(refunded_at, NOW())
    WHERE payment_status = 'refunded';
  END IF;
END $$;

-- A cancelled show must not keep its slot from being scheduled again
ALTER TABLE public.shows DROP CONSTRAINT IF EXISTS shows_screen_id_show_date_show_time_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shows_active_slot
  ON public.shows(screen_id, show_date, show_time) WHERE cancelled_at IS NULL;

-- One hold window per customer and show. Holds can't outlive it, whatever
-- the customer presses. Removed when they pay.
CREATE TABLE IF NOT EXISTS public.hold_windows (
  owner      UUID        NOT NULL,
  show_id    UUID        NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- When their last hold ended or will end. Holding nothing for the cool-down
  -- after this starts a fresh window: walking away isn't held against anyone.
  last_held_until TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner, show_id)
);
ALTER TABLE public.hold_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hold_windows FROM anon, authenticated;

-- ── 2. HOLDS ────────────────────────────────────────────────
-- hold_limit_at(): when this owner's holds on this show must end.
-- NULL means no limit: counter staff have no window.
CREATE OR REPLACE FUNCTION public.hold_limit_at(p_show_id UUID, p_owner UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT w.started_at + INTERVAL '25 minutes'
  FROM public.hold_windows w
  WHERE w.show_id = p_show_id AND w.owner = p_owner;
$$;

-- lock_seats(): adds to 004
--   • refuses cancelled shows and hidden films
--   • 'hold_limit' once the hold window is used up, until a cool-down has passed
--   • re-locking never shortens a hold that a payment may be relying on
--   • over the 10-seat cap, the owner's holds on other shows make way
--   • bookings for a different set of seats are marked as given up
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
  c_cooldown      CONSTANT INTERVAL := INTERVAL '10 minutes';
  c_max_per_owner CONSTANT INTEGER  := 10;
  c_max_per_ip    CONSTANT INTEGER  := 24;
  v_ids           UUID[];
  v_starts_at     TIMESTAMPTZ;
  v_cancelled_at  TIMESTAMPTZ;
  v_movie_active  BOOLEAN;
  v_limit         TIMESTAMPTZ;
  v_found         INTEGER;
  v_blocked       INTEGER;
  v_owner_held    INTEGER;
  v_ip_held       INTEGER;
BEGIN
  SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids FROM unnest(p_seat_layout_ids) AS id;
  IF p_owner IS NULL OR v_ids IS NULL OR cardinality(v_ids) > c_max_per_owner THEN
    RETURN 'invalid';
  END IF;

  SELECT (s.show_date + s.show_time) AT TIME ZONE 'Asia/Kolkata', s.cancelled_at, m.is_active
    INTO v_starts_at, v_cancelled_at, v_movie_active
  FROM public.shows s
  JOIN public.movies m ON m.id = s.movie_id
  WHERE s.id = p_show_id;
  IF NOT FOUND OR v_cancelled_at IS NOT NULL OR NOT v_movie_active THEN RETURN 'invalid'; END IF;
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

  IF p_client_ip IS NOT NULL THEN
    SELECT count(*) INTO v_ip_held
    FROM public.seat_status
    WHERE locked_ip = p_client_ip AND status = 'locked' AND lock_expires_at > NOW()
      AND NOT (show_id = p_show_id AND locked_by = p_owner);
    IF v_ip_held + cardinality(v_ids) > c_max_per_ip THEN RETURN 'ip_cap'; END IF;
  END IF;

  -- Counter staff sell all day from one login, so only customers get a window.
  -- Someone who has held nothing for the cool-down starts a fresh one.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner AND role IN ('admin', 'member')) THEN
    INSERT INTO public.hold_windows AS w (owner, show_id) VALUES (p_owner, p_show_id)
    ON CONFLICT (owner, show_id) DO UPDATE SET started_at = NOW(), last_held_until = NOW()
      WHERE w.last_held_until + c_cooldown <= NOW();
    v_limit := public.hold_limit_at(p_show_id, p_owner);
    IF v_limit <= NOW() THEN RETURN 'hold_limit'; END IF;
  END IF;

  -- This request replaces the owner's holds on this show. Holds on other shows
  -- only make way if the 10-seat cap would otherwise be exceeded.
  SELECT count(*) INTO v_owner_held
  FROM public.seat_status
  WHERE locked_by = p_owner AND status = 'locked' AND lock_expires_at > NOW()
    AND show_id <> p_show_id;
  IF v_owner_held + cardinality(v_ids) > c_max_per_owner THEN
    PERFORM public.release_seat_holds(s.show_id, NULL, p_owner)
    FROM (SELECT DISTINCT show_id FROM public.seat_status
          WHERE locked_by = p_owner AND status = 'locked' AND show_id <> p_show_id) s;
  END IF;

  UPDATE public.seat_status
  SET status = 'available', locked_by = NULL, locked_ip = NULL, locked_at = NULL, lock_expires_at = NULL
  WHERE show_id = p_show_id AND locked_by = p_owner AND status = 'locked'
    AND NOT (seat_layout_id = ANY(v_ids));

  UPDATE public.seat_status
  SET status = 'locked', locked_by = p_owner, locked_ip = p_client_ip, locked_at = NOW(),
      lock_expires_at = LEAST(
        GREATEST(CASE WHEN locked_by = p_owner AND lock_expires_at > NOW() THEN lock_expires_at END, NOW() + c_hold),
        COALESCE(v_limit, 'infinity'::timestamptz))
  WHERE show_id = p_show_id AND seat_layout_id = ANY(v_ids);

  UPDATE public.hold_windows
  SET last_held_until = GREATEST(last_held_until, LEAST(NOW() + c_hold, COALESCE(v_limit, 'infinity'::timestamptz)))
  WHERE owner = p_owner AND show_id = p_show_id;

  -- A pending booking for any other set of seats is no longer what they want.
  -- One locked right now has a payment landing on it, and that payment may be
  -- waiting for these seats. Skipping it avoids a deadlock and lets the payment finish.
  UPDATE public.bookings
  SET superseded_at = NOW()
  WHERE id IN (
    SELECT b.id FROM public.bookings b
    WHERE b.hold_owner = p_owner AND b.show_id = p_show_id
      AND b.payment_status = 'pending' AND b.superseded_at IS NULL
      AND (SELECT array_agg(bs.seat_layout_id ORDER BY bs.seat_layout_id)
             FROM public.booking_seats bs WHERE bs.booking_id = b.id) IS DISTINCT FROM v_ids
    FOR UPDATE OF b SKIP LOCKED);

  RETURN 'ok';
END;
$$;

-- release_seat_holds(): the customer lets seats go. All their seats on a show
-- when the list is NULL, on every show when the show is NULL as well.
CREATE OR REPLACE FUNCTION public.release_seat_holds(
  p_show_id         UUID,
  p_seat_layout_ids UUID[],
  p_owner           UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_owner IS NULL THEN RETURN 0; END IF;

  UPDATE public.seat_status
  SET status = 'available', locked_by = NULL, locked_ip = NULL, locked_at = NULL, lock_expires_at = NULL
  WHERE locked_by = p_owner AND status = 'locked'
    AND (p_show_id IS NULL OR show_id = p_show_id)
    AND (p_seat_layout_ids IS NULL OR seat_layout_id = ANY(p_seat_layout_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Nothing left held on a show: the cool-down counts from now
  UPDATE public.hold_windows w
  SET last_held_until = LEAST(w.last_held_until, NOW())
  WHERE w.owner = p_owner AND (p_show_id IS NULL OR w.show_id = p_show_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.seat_status s
      WHERE s.show_id = w.show_id AND s.locked_by = p_owner AND s.status = 'locked' AND s.lock_expires_at > NOW());

  -- Skips a booking locked right now, for the same reason as lock_seats
  UPDATE public.bookings
  SET superseded_at = NOW()
  WHERE id IN (
    SELECT b.id FROM public.bookings b
    WHERE b.hold_owner = p_owner AND b.payment_status = 'pending' AND b.superseded_at IS NULL
      AND (p_show_id IS NULL OR b.show_id = p_show_id)
      AND (p_seat_layout_ids IS NULL OR EXISTS (
            SELECT 1 FROM public.booking_seats bs
            WHERE bs.booking_id = b.id AND bs.seat_layout_id = ANY(p_seat_layout_ids)))
    FOR UPDATE OF b SKIP LOCKED);

  RETURN v_count;
END;
$$;

-- extend_seat_holds(): as 002, but never past the hold window
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
  v_expires TIMESTAMPTZ;
  v_count   INTEGER;
BEGIN
  SELECT array_agg(DISTINCT id) INTO v_ids FROM unnest(p_seat_layout_ids) AS id;
  IF p_owner IS NULL OR v_ids IS NULL THEN RETURN NULL; END IF;

  v_expires := LEAST(
    NOW() + make_interval(secs => LEAST(GREATEST(p_seconds, 60), 1200)),
    COALESCE(public.hold_limit_at(p_show_id, p_owner), 'infinity'::timestamptz));
  IF v_expires <= NOW() THEN RETURN NULL; END IF;

  UPDATE public.seat_status
  SET lock_expires_at = GREATEST(lock_expires_at, v_expires)
  WHERE show_id = p_show_id AND seat_layout_id = ANY(v_ids)
    AND locked_by = p_owner AND status = 'locked' AND lock_expires_at > NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> cardinality(v_ids) THEN RETURN NULL; END IF;

  UPDATE public.hold_windows
  SET last_held_until = GREATEST(last_held_until, v_expires)
  WHERE owner = p_owner AND show_id = p_show_id;

  RETURN v_expires;
END;
$$;

-- adopt_guest_holds(): a guest signed in mid-checkout. Their live holds and
-- unpaid bookings move to the account. Paid guest tickets stay with the guest:
-- this browser may be shared, and a later sign-in must not collect them.
CREATE OR REPLACE FUNCTION public.adopt_guest_holds(p_guest UUID, p_user UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_guest IS NULL OR p_user IS NULL OR p_guest = p_user THEN RETURN 0; END IF;

  -- Booking first, then seats: the order finalize_payment locks them in
  UPDATE public.bookings
  SET hold_owner = p_user, booked_by = COALESCE(booked_by, p_user)
  WHERE hold_owner = p_guest AND payment_status = 'pending';

  UPDATE public.seat_status
  SET locked_by = p_user
  WHERE locked_by = p_guest AND status = 'locked' AND lock_expires_at > NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.hold_windows (owner, show_id, started_at, last_held_until)
  SELECT p_user, show_id, started_at, last_held_until FROM public.hold_windows WHERE owner = p_guest
  ON CONFLICT (owner, show_id) DO NOTHING;
  DELETE FROM public.hold_windows WHERE owner = p_guest;

  RETURN v_count;
END;
$$;

-- sweep_expired_locks(): also clears long-finished hold windows
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

  DELETE FROM public.hold_windows WHERE started_at < NOW() - INTERVAL '2 hours';

  RETURN v_count;
END;
$$;

-- ── 3. CHECKOUT ─────────────────────────────────────────────
-- create_pending_booking(): adds to 004
--   • a retried key updates the details and channel (they may have been corrected)
--   • a retried key must be for the same seats
--   • a booking given up earlier can't be reused unless the same key comes back
--   • refuses cancelled shows and hidden films
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

  SELECT s.* INTO v_show
  FROM public.shows s
  JOIN public.movies m ON m.id = s.movie_id
  WHERE s.id = p_show_id AND s.cancelled_at IS NULL AND m.is_active;
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

  -- Retried request: only ever hand back the caller's own booking, for these seats
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.bookings WHERE client_idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_existing.hold_owner IS DISTINCT FROM p_hold_owner
         OR (SELECT array_agg(bs.seat_layout_id ORDER BY bs.seat_layout_id)
               FROM public.booking_seats bs WHERE bs.booking_id = v_existing.id) IS DISTINCT FROM v_ids THEN
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
    UPDATE public.bookings
    SET customer_name = p_name, customer_phone = p_phone, customer_email = p_email,
        booking_channel = p_channel, superseded_at = NULL
    WHERE id = v_existing.id AND payment_status = 'pending';
    RETURN jsonb_build_object('status', 'existing', 'hold_expires_at', v_expires, 'booking', (SELECT to_jsonb(b) - 'client_idempotency_key' - 'hold_owner' FROM public.bookings b WHERE b.id = v_existing.id));
  END IF;

  -- Same person, same show, same seats, still unpaid: reuse it
  SELECT b.* INTO v_existing
  FROM public.bookings b
  WHERE b.hold_owner = p_hold_owner AND b.show_id = p_show_id
    AND b.booking_channel = p_channel AND b.payment_status = 'pending'
    AND b.superseded_at IS NULL
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

-- ── 4. PAYMENTS ─────────────────────────────────────────────
-- finalize_payment(): adds to 002
--   • money for a cancelled show or for seats the customer gave up is refunded
--   • a confirmed purchase ends the hold window, so they can buy more seats
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
  v_booking      public.bookings%ROWTYPE;
  v_show_id      UUID;
  v_cancelled_at TIMESTAMPTZ;
  v_ids          UUID[];
  v_found        INTEGER;
  v_blocked      INTEGER;
BEGIN
  IF p_conflict_status NOT IN ('refund_pending', 'failed') THEN
    RAISE EXCEPTION 'invalid conflict status %', p_conflict_status;
  END IF;

  -- Locks the show first, then the booking, the same order as cancel_show. Otherwise
  -- a payment landing mid-cancellation could confirm a ticket for a cancelled show.
  SELECT show_id INTO v_show_id FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  SELECT cancelled_at INTO v_cancelled_at FROM public.shows WHERE id = v_show_id FOR SHARE;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.payment_status = 'paid' THEN RETURN 'already_paid'; END IF;
  IF v_booking.payment_status IN ('refund_pending', 'refunded') THEN RETURN 'refunding'; END IF;

  IF v_cancelled_at IS NOT NULL OR v_booking.superseded_at IS NOT NULL THEN
    UPDATE public.bookings
    SET payment_status = p_conflict_status,
        razorpay_payment_id = p_payment_id,
        refund_reason = CASE
          WHEN p_conflict_status <> 'refund_pending' THEN refund_reason
          WHEN v_cancelled_at IS NOT NULL THEN 'show_cancelled'
          ELSE 'customer_changed_seats'
        END
    WHERE id = p_booking_id;
    RETURN 'conflict';
  END IF;

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

      DELETE FROM public.hold_windows
      WHERE owner = v_booking.hold_owner AND show_id = v_booking.show_id;

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

-- record_external_refund(): a full refund made outside the app (Razorpay
-- dashboard). The ticket stops working and the seats go back on sale.
-- Returns 'refunded' | 'ignored'.
CREATE OR REPLACE FUNCTION public.record_external_refund(
  p_booking_id UUID,
  p_payment_id TEXT,
  p_refund_id  TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings
  SET payment_status = 'refunded',
      razorpay_refund_id = p_refund_id,
      refunded_at = NOW(),
      refund_reason = 'refunded_by_cinema'
  WHERE id = p_booking_id AND payment_status = 'paid' AND razorpay_payment_id = p_payment_id;
  IF NOT FOUND THEN RETURN 'ignored'; END IF;

  UPDATE public.seat_status
  SET status = 'available', booking_id = NULL
  WHERE booking_id = p_booking_id AND status = 'booked';

  RETURN 'refunded';
END;
$$;

-- cancel_show(): takes a show off sale. A show nobody ever tried to book is
-- simply deleted. Otherwise online tickets join the refund queue, cash tickets
-- are marked for repayment at the counter, holds are freed, and any payment
-- still on its way is refunded by finalize_payment. A show that has started and
-- has paid tickets is refused: those people have seen it, or are watching it.
-- Returns jsonb: { status: 'deleted'|'cancelled'|'already_started'|'not_found', online_refunds, cash_refunds }
CREATE OR REPLACE FUNCTION public.cancel_show(p_show_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_online    INTEGER;
  v_cash      INTEGER;
  v_starts_at TIMESTAMPTZ;
BEGIN
  SELECT (show_date + show_time) AT TIME ZONE 'Asia/Kolkata' INTO v_starts_at
  FROM public.shows WHERE id = p_show_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;

  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE show_id = p_show_id) THEN
    DELETE FROM public.shows WHERE id = p_show_id;
    RETURN jsonb_build_object('status', 'deleted', 'online_refunds', 0, 'cash_refunds', 0);
  END IF;

  IF v_starts_at <= NOW() AND EXISTS (
    SELECT 1 FROM public.bookings WHERE show_id = p_show_id AND payment_status = 'paid'
  ) THEN
    RETURN jsonb_build_object('status', 'already_started', 'online_refunds', 0, 'cash_refunds', 0);
  END IF;

  UPDATE public.shows SET cancelled_at = COALESCE(cancelled_at, NOW()) WHERE id = p_show_id;

  UPDATE public.seat_status
  SET status = 'available', locked_by = NULL, locked_ip = NULL, locked_at = NULL, lock_expires_at = NULL
  WHERE show_id = p_show_id AND status = 'locked';

  UPDATE public.bookings
  SET payment_status = 'refunded', refund_reason = 'show_cancelled_cash', refunded_at = NOW()
  WHERE show_id = p_show_id AND payment_status = 'paid' AND razorpay_payment_id LIKE 'pay_cash_%';
  GET DIAGNOSTICS v_cash = ROW_COUNT;

  UPDATE public.bookings
  SET payment_status = 'refund_pending', refund_reason = 'show_cancelled'
  WHERE show_id = p_show_id AND payment_status = 'paid';
  GET DIAGNOSTICS v_online = ROW_COUNT;

  RETURN jsonb_build_object('status', 'cancelled', 'online_refunds', v_online, 'cash_refunds', v_cash);
END;
$$;

-- ── 5. THE GATE ─────────────────────────────────────────────
-- admit_seats(): lets in some or all of the people on a ticket, for families who
-- arrive separately. NULL means everyone not yet in. Returns how many this call
-- admitted, 0 when nobody was left. Locked, so two gates can't admit the same people.
CREATE OR REPLACE FUNCTION public.admit_seats(p_booking_id UUID, p_staff UUID, p_count INTEGER DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_done  INTEGER;
  v_used  TIMESTAMPTZ;
  v_total INTEGER;
  v_add   INTEGER;
BEGIN
  SELECT admitted_seats, checked_in_at INTO v_done, v_used
  FROM public.bookings
  WHERE id = p_booking_id AND payment_status = 'paid'
  FOR UPDATE;
  IF NOT FOUND OR v_used IS NOT NULL THEN RETURN 0; END IF;

  SELECT count(*) INTO v_total FROM public.booking_seats WHERE booking_id = p_booking_id;
  v_add := LEAST(COALESCE(p_count, v_total), v_total - v_done);
  IF v_add <= 0 THEN RETURN 0; END IF;

  UPDATE public.bookings
  SET admitted_seats = v_done + v_add,
      checked_in_by = p_staff,
      checked_in_at = CASE WHEN v_done + v_add >= v_total THEN NOW() END
  WHERE id = p_booking_id;

  RETURN v_add;
END;
$$;

-- undo_admission(): for an entry made by mistake. Returns false if nobody was in.
CREATE OR REPLACE FUNCTION public.undo_admission(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings
  SET admitted_seats = 0, checked_in_at = NULL, checked_in_by = NULL
  WHERE id = p_booking_id AND (checked_in_at IS NOT NULL OR admitted_seats > 0);
  RETURN FOUND;
END;
$$;

-- ── 6. WHO MAY CALL WHAT ────────────────────────────────────
REVOKE ALL ON FUNCTION public.hold_limit_at(UUID, UUID)                                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_seats(UUID, UUID[], UUID, TEXT)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_seat_holds(UUID, UUID[], UUID)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.extend_seat_holds(UUID, UUID[], UUID, INTEGER)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adopt_guest_holds(UUID, UUID)                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sweep_expired_locks()                                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_pending_booking(UUID, UUID[], UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_payment(UUID, TEXT, TEXT, TEXT)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_external_refund(UUID, TEXT, TEXT)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_show(UUID)                                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admit_seats(UUID, UUID, INTEGER)                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.undo_admission(UUID)                                     FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hold_limit_at(UUID, UUID)                             TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_seats(UUID, UUID[], UUID, TEXT)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_seat_holds(UUID, UUID[], UUID)                TO service_role;
GRANT EXECUTE ON FUNCTION public.extend_seat_holds(UUID, UUID[], UUID, INTEGER)        TO service_role;
GRANT EXECUTE ON FUNCTION public.adopt_guest_holds(UUID, UUID)                         TO service_role;
GRANT EXECUTE ON FUNCTION public.sweep_expired_locks()                                 TO service_role;
GRANT EXECUTE ON FUNCTION public.create_pending_booking(UUID, UUID[], UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_payment(UUID, TEXT, TEXT, TEXT)              TO service_role;
GRANT EXECUTE ON FUNCTION public.record_external_refund(UUID, TEXT, TEXT)              TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_show(UUID)                                     TO service_role;
GRANT EXECUTE ON FUNCTION public.admit_seats(UUID, UUID, INTEGER)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_admission(UUID)                                  TO service_role;

-- ── 7. TABLE ACCESS FOR THE PUBLIC KEY ──────────────────────
-- Staff screens read bookings through the server. With these policies any staff
-- login could dump every name, phone, email and secret ticket key directly.
DROP POLICY IF EXISTS "bookings: staff reads all"      ON public.bookings;
DROP POLICY IF EXISTS "booking_seats: staff reads all" ON public.booking_seats;
