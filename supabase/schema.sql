-- ============================================================
-- DHRUB CINEPLEX — SUPABASE SCHEMA
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ⚠️  FULL RESET: drops all existing tables, policies, and
--     functions before recreating. Safe to re-run anytime.
-- ============================================================

-- ── TEARDOWN (drop everything in dependency order) ───────────
DROP TRIGGER  IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user()    CASCADE;
DROP FUNCTION IF EXISTS public.lock_seats(UUID, UUID[], UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.confirm_booking(UUID, UUID, UUID[], UUID) CASCADE;
DROP FUNCTION IF EXISTS public.sweep_expired_locks() CASCADE;
DROP FUNCTION IF EXISTS public.is_staff()  CASCADE;
DROP FUNCTION IF EXISTS public.is_admin()  CASCADE;

DROP TABLE IF EXISTS public.processed_webhook_events CASCADE;
DROP TABLE IF EXISTS public.audit_logs    CASCADE;
DROP TABLE IF EXISTS public.booking_seats CASCADE;
DROP TABLE IF EXISTS public.bookings      CASCADE;
DROP TABLE IF EXISTS public.seat_status   CASCADE;
DROP TABLE IF EXISTS public.shows         CASCADE;
DROP TABLE IF EXISTS public.seat_layout   CASCADE;
DROP TABLE IF EXISTS public.screens       CASCADE;
DROP TABLE IF EXISTS public.movies        CASCADE;
DROP TABLE IF EXISTS public.profiles      CASCADE;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. PROFILES ─────────────────────────────────────────────
-- Mirrors auth.users; created automatically via trigger on signup
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'member', 'user')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. MOVIES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.movies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  synopsis          TEXT NOT NULL DEFAULT '',
  genre             TEXT NOT NULL DEFAULT '',
  language          TEXT NOT NULL DEFAULT 'Hindi',
  duration_minutes  INTEGER NOT NULL DEFAULT 120,
  certification     TEXT NOT NULL DEFAULT 'UA',
  poster_url        TEXT NOT NULL DEFAULT '',
  trailer_url       TEXT NOT NULL DEFAULT '',
  is_featured       BOOLEAN NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. SCREENS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.screens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  total_rows    INTEGER NOT NULL DEFAULT 8,
  seats_per_row INTEGER NOT NULL DEFAULT 10
);

-- ── 4. SEAT LAYOUT ──────────────────────────────────────────
-- Static blueprint of each seat in each screen
CREATE TABLE IF NOT EXISTS public.seat_layout (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id   UUID NOT NULL REFERENCES public.screens(id) ON DELETE CASCADE,
  row_label   TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  category    TEXT NOT NULL DEFAULT 'normal' CHECK (category IN ('normal', 'premium', 'recliner')),
  UNIQUE (screen_id, row_label, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_seat_layout_screen ON public.seat_layout(screen_id);

-- ── 5. SHOWS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id        UUID NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  screen_id       UUID NOT NULL REFERENCES public.screens(id) ON DELETE CASCADE,
  show_date       DATE NOT NULL,
  show_time       TIME NOT NULL,
  price_normal    NUMERIC(10,2) NOT NULL DEFAULT 180,
  price_premium   NUMERIC(10,2) NOT NULL DEFAULT 250,
  price_recliner  NUMERIC(10,2) NOT NULL DEFAULT 400,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (screen_id, show_date, show_time)
);

CREATE INDEX IF NOT EXISTS idx_shows_date ON public.shows(show_date);
CREATE INDEX IF NOT EXISTS idx_shows_movie ON public.shows(movie_id);

-- ── 6. SEAT STATUS ──────────────────────────────────────────
-- Per-show, per-seat availability state
CREATE TABLE IF NOT EXISTS public.seat_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id         UUID NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  seat_layout_id  UUID NOT NULL REFERENCES public.seat_layout(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'locked', 'booked')),
  locked_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at       TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,
  booking_id      UUID, -- FK added after bookings table exists (see below)
  UNIQUE (show_id, seat_layout_id)
);

CREATE INDEX IF NOT EXISTS idx_seat_status_show ON public.seat_status(show_id);
CREATE INDEX IF NOT EXISTS idx_seat_status_locked_by ON public.seat_status(locked_by);

-- ── 7. BOOKINGS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bookings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id                 UUID NOT NULL REFERENCES public.shows(id) ON DELETE RESTRICT,
  booked_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  booking_channel         TEXT NOT NULL DEFAULT 'online' CHECK (booking_channel IN ('online', 'counter')),
  customer_name           TEXT,
  customer_phone          TEXT,
  total_amount            NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status          TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  razorpay_order_id       TEXT,
  razorpay_payment_id     TEXT,
  client_idempotency_key  TEXT UNIQUE,
  qr_code_token           TEXT UNIQUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user ON public.bookings(booked_by);
CREATE INDEX IF NOT EXISTS idx_bookings_show ON public.bookings(show_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(payment_status);

-- Add FK from seat_status back to bookings now that bookings table exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_seat_status_booking'
  ) THEN
    ALTER TABLE public.seat_status
      ADD CONSTRAINT fk_seat_status_booking
      FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- ── 8. BOOKING SEATS ────────────────────────────────────────
-- Line items: which seat at what price for each booking
CREATE TABLE IF NOT EXISTS public.booking_seats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  seat_layout_id  UUID NOT NULL REFERENCES public.seat_layout(id) ON DELETE RESTRICT,
  price           NUMERIC(10,2) NOT NULL,
  UNIQUE (booking_id, seat_layout_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_seats_booking ON public.booking_seats(booking_id);

-- ── 9. AUDIT LOGS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  details     JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ── 10. PROCESSED WEBHOOK EVENTS ─────────────────────────────
-- Prevent duplicate Razorpay webhook event processing
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  razorpay_event_id TEXT PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- STORED PROCEDURES (called via supabase.rpc())
-- ============================================================

-- ── lock_seats() ────────────────────────────────────────────
-- Atomically locks seats for a user. Returns TRUE on success, FALSE if any seat
-- is already taken (concurrent safety via FOR UPDATE NOWAIT).
CREATE OR REPLACE FUNCTION public.lock_seats(
  p_show_id         UUID,
  p_seat_layout_ids UUID[],
  p_user_id         UUID,
  p_ui_hold_seconds INTEGER DEFAULT 360
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ;
  v_row        RECORD;
BEGIN
  -- Add 15s server-side buffer on top of UI countdown
  v_expires_at := NOW() + ((p_ui_hold_seconds + 15) * INTERVAL '1 second');

  -- Attempt to lock all requested seats atomically (NOWAIT = fail immediately if locked)
  BEGIN
    FOR v_row IN
      SELECT id FROM public.seat_status
      WHERE show_id = p_show_id
        AND seat_layout_id = ANY(p_seat_layout_ids)
      FOR UPDATE NOWAIT
    LOOP
      -- Check each row is still available
      IF (SELECT status FROM public.seat_status WHERE id = v_row.id) != 'available' THEN
        RETURN FALSE;
      END IF;
    END LOOP;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN FALSE;
  END;

  -- All seats are available — acquire the locks
  UPDATE public.seat_status
  SET
    status          = 'locked',
    locked_by       = p_user_id,
    locked_at       = NOW(),
    lock_expires_at = v_expires_at
  WHERE show_id = p_show_id
    AND seat_layout_id = ANY(p_seat_layout_ids)
    AND status = 'available';

  -- If we didn't update the expected number of rows, something slipped through
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- ── confirm_booking() ────────────────────────────────────────
-- Validates locks still belong to the user then marks seats as booked.
-- Called server-side after payment confirmation.
CREATE OR REPLACE FUNCTION public.confirm_booking(
  p_booking_id      UUID,
  p_show_id         UUID,
  p_seat_layout_ids UUID[],
  p_user_id         UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invalid_count INTEGER;
BEGIN
  -- For counter bookings (p_user_id IS NULL), skip lock ownership check
  IF p_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_invalid_count
    FROM public.seat_status
    WHERE show_id        = p_show_id
      AND seat_layout_id = ANY(p_seat_layout_ids)
      AND (status != 'locked' OR locked_by != p_user_id OR lock_expires_at < NOW());

    IF v_invalid_count > 0 THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Mark seats as permanently booked
  UPDATE public.seat_status
  SET
    status          = 'booked',
    booking_id      = p_booking_id,
    locked_by       = NULL,
    locked_at       = NULL,
    lock_expires_at = NULL
  WHERE show_id = p_show_id
    AND seat_layout_id = ANY(p_seat_layout_ids);

  RETURN TRUE;
END;
$$;

-- ── sweep_expired_locks() ────────────────────────────────────
-- Releases timed-out seat locks. Can be scheduled via pg_cron or called manually.
CREATE OR REPLACE FUNCTION public.sweep_expired_locks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.seat_status
  SET
    status          = 'available',
    locked_by       = NULL,
    locked_at       = NULL,
    lock_expires_at = NULL
  WHERE status = 'locked'
    AND lock_expires_at IS NOT NULL
    AND lock_expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_layout   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_status   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is admin or member (staff)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'member')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

-- ── profiles ────────────────────────────────────────────────
CREATE POLICY "profiles: own row read" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles: staff read all" ON public.profiles
  FOR SELECT USING (public.is_staff());

CREATE POLICY "profiles: own row update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles: admin update role" ON public.profiles
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "profiles: insert own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ── movies ──────────────────────────────────────────────────
CREATE POLICY "movies: public read active" ON public.movies
  FOR SELECT USING (is_active = TRUE);

CREATE POLICY "movies: staff read all" ON public.movies
  FOR SELECT USING (public.is_staff());

CREATE POLICY "movies: admin write" ON public.movies
  FOR ALL USING (public.is_admin());

-- ── screens ─────────────────────────────────────────────────
CREATE POLICY "screens: public read" ON public.screens
  FOR SELECT USING (TRUE);

CREATE POLICY "screens: admin write" ON public.screens
  FOR ALL USING (public.is_admin());

-- ── seat_layout ─────────────────────────────────────────────
CREATE POLICY "seat_layout: public read" ON public.seat_layout
  FOR SELECT USING (TRUE);

CREATE POLICY "seat_layout: admin write" ON public.seat_layout
  FOR ALL USING (public.is_admin());

-- ── shows ───────────────────────────────────────────────────
CREATE POLICY "shows: public read" ON public.shows
  FOR SELECT USING (TRUE);

CREATE POLICY "shows: admin write" ON public.shows
  FOR ALL USING (public.is_admin());

-- ── seat_status ─────────────────────────────────────────────
CREATE POLICY "seat_status: public read" ON public.seat_status
  FOR SELECT USING (TRUE);

-- Only the lock_seats / confirm_booking RPCs (SECURITY DEFINER) should write here
-- But also allow staff to unlock directly
CREATE POLICY "seat_status: staff write" ON public.seat_status
  FOR UPDATE USING (public.is_staff());

-- ── bookings ────────────────────────────────────────────────
CREATE POLICY "bookings: user reads own" ON public.bookings
  FOR SELECT USING (auth.uid() = booked_by);

CREATE POLICY "bookings: staff reads all" ON public.bookings
  FOR SELECT USING (public.is_staff());

CREATE POLICY "bookings: authenticated insert" ON public.bookings
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR booking_channel = 'counter');

CREATE POLICY "bookings: staff update" ON public.bookings
  FOR UPDATE USING (public.is_staff());

-- ── booking_seats ───────────────────────────────────────────
CREATE POLICY "booking_seats: user reads own" ON public.booking_seats
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.bookings WHERE id = booking_id AND booked_by = auth.uid())
  );

CREATE POLICY "booking_seats: staff reads all" ON public.booking_seats
  FOR SELECT USING (public.is_staff());

CREATE POLICY "booking_seats: insert" ON public.booking_seats
  FOR INSERT WITH CHECK (TRUE); -- controlled by bookings insert policy

-- ── audit_logs ──────────────────────────────────────────────
CREATE POLICY "audit_logs: admin read" ON public.audit_logs
  FOR SELECT USING (public.is_admin());

CREATE POLICY "audit_logs: insert all" ON public.audit_logs
  FOR INSERT WITH CHECK (TRUE); -- server-side only via service role

-- ── processed_webhook_events ─────────────────────────────────
CREATE POLICY "processed_webhook_events: admin read" ON public.processed_webhook_events
  FOR SELECT USING (public.is_admin());

CREATE POLICY "processed_webhook_events: insert all" ON public.processed_webhook_events
  FOR INSERT WITH CHECK (TRUE);

-- ============================================================
-- SEED DATA (optional — comment out for production)
-- Mirrors the MockDatabase seed so the app works identically
-- ============================================================

-- Movies
INSERT INTO public.movies (id, title, synopsis, genre, language, duration_minutes, certification, poster_url, trailer_url, is_featured, is_active) VALUES
  ('d798a3b8-6c84-4828-98e3-50ebbc2a1d21', 'Bahubali', 'In the kingdom of Mahishmati, Shivudu falls in love with a young warrior woman. While trying to woo her, he learns about the conflict-ridden past of his family and his true legacy.', 'Action, Drama', 'Telugu (Hindi Dubbed)', 159, 'UA', 'https://miro.medium.com/1*YdW-g6mqSnnS5ogid99EYg.jpeg', 'https://www.youtube.com/embed/sOEg_YZQsTI', TRUE, TRUE),
  ('e0e56e07-6bcf-40a2-8b8b-d784fa734e56', 'Jawan', 'A high-octane action thriller which outlines the emotional journey of a man who is set to rectify the wrongs in the society.', 'Action, Thriller', 'Hindi', 169, 'UA', 'https://upload.wikimedia.org/wikipedia/en/3/39/Jawan_film_poster.jpg', 'https://www.youtube.com/embed/COv52Qyctws', TRUE, TRUE),
  ('9d863f69-d9fe-45db-b962-73a71bbf5327', 'Pathaan', 'An Indian spy takes on the leader of a group of mercenaries who have nefarious plans to target his homeland.', 'Action, Thriller', 'Hindi', 146, 'UA', 'https://upload.wikimedia.org/wikipedia/en/c/c3/Pathaan_film_poster.jpg', 'https://www.youtube.com/embed/vqu4z34wENw', TRUE, TRUE),
  ('a1b2c3d4-e5f6-7890-1234-56789abcdef0', 'Animal', 'The hardened son of a powerful industrialist returns home after years abroad and vows to take blood revenge on those threatening his fathers life.', 'Action, Drama', 'Hindi', 201, 'A', 'https://upload.wikimedia.org/wikipedia/en/9/90/Animal_%282023_film%29_poster.jpg', 'https://www.youtube.com/embed/Dydmpct60Qo', TRUE, TRUE),
  ('b2c3d4e5-f6a7-8901-2345-6789abcdef01', 'Dangal', 'Former wrestler Mahavir Singh Phogat and his two wrestler daughters struggle towards glory at the Commonwealth Games in the face of societal oppression.', 'Biography, Drama', 'Hindi', 161, 'U', 'https://upload.wikimedia.org/wikipedia/en/9/99/Dangal_Poster.jpg', 'https://www.youtube.com/embed/x_7YlGv9u1g', FALSE, TRUE),
  ('c3d4e5f6-a7b8-9012-3456-789abcdef012', 'PK', 'An alien on Earth loses the only device he can use to communicate with his spaceship. His innocent nature and child-like questions force the country to evaluate the impact of religion on its people.', 'Comedy, Drama', 'Hindi', 153, 'UA', 'https://upload.wikimedia.org/wikipedia/en/c/c3/PK_poster.jpg', 'https://www.youtube.com/embed/82ZEDGPCkT8', FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Screens
INSERT INTO public.screens (id, name, total_rows, seats_per_row) VALUES
  ('a9f1a0e7-3f36-41b2-bb5b-43a0e698889c', 'Screen 1 (IMAX)', 8, 10),
  ('bb28876c-3e6f-4db4-bb14-5d5b12165977', 'Screen 2 (Gold)', 6, 8)
ON CONFLICT (id) DO NOTHING;

-- Seat layouts for Screen 1 (IMAX): rows A-H, 10 seats
-- A-D = normal, E-F = premium, G-H = recliner
INSERT INTO public.seat_layout (screen_id, row_label, seat_number, category)
SELECT
  'a9f1a0e7-3f36-41b2-bb5b-43a0e698889c',
  r.row_label,
  s.seat_number,
  CASE
    WHEN r.row_label IN ('E','F') THEN 'premium'
    WHEN r.row_label IN ('G','H') THEN 'recliner'
    ELSE 'normal'
  END
FROM
  (VALUES ('A'),('B'),('C'),('D'),('E'),('F'),('G'),('H')) AS r(row_label),
  generate_series(1, 10) AS s(seat_number)
ON CONFLICT (screen_id, row_label, seat_number) DO NOTHING;

-- Seat layouts for Screen 2 (Gold): rows A-F, 8 seats
-- A-C = normal, D-E = premium, F = recliner
INSERT INTO public.seat_layout (screen_id, row_label, seat_number, category)
SELECT
  'bb28876c-3e6f-4db4-bb14-5d5b12165977',
  r.row_label,
  s.seat_number,
  CASE
    WHEN r.row_label IN ('D','E') THEN 'premium'
    WHEN r.row_label = 'F'       THEN 'recliner'
    ELSE 'normal'
  END
FROM
  (VALUES ('A'),('B'),('C'),('D'),('E'),('F')) AS r(row_label),
  generate_series(1, 8) AS s(seat_number)
ON CONFLICT (screen_id, row_label, seat_number) DO NOTHING;
