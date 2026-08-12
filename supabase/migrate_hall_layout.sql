-- ============================================================
-- DHRUB TALKIES — HALL LAYOUT MIGRATION
-- Paste this into: Supabase Dashboard → SQL Editor → New Query
-- Then click RUN ▶
-- ============================================================

-- 1. Add price_classic column to shows
ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS price_classic NUMERIC(10,2) NOT NULL DEFAULT 150;
UPDATE public.shows SET price_classic = 150, price_premium = 200;

-- 2. Drop old category constraint
ALTER TABLE public.seat_layout
  DROP CONSTRAINT IF EXISTS seat_layout_category_check;

-- 3. Clear seat_status
DELETE FROM public.seat_status;

-- 4. Clear booking_seats (unblocks the seat_layout FK)
DELETE FROM public.booking_seats;

-- 5. Clear old seat layouts
DELETE FROM public.seat_layout;

-- 6. Insert actual Dhrub Talkies hall layout (from sketch)
--
--  Rows G, F, E, D, C, B, A → 18 seats: [1-18 Classic]
--  Row P  (Premium)         → 11 seats: [1-11 Premium]   ₹200

INSERT INTO public.seat_layout (screen_id, row_label, seat_number, category)

-- Rows G-A: all classic
SELECT scr.id, r.row_label, n.num, 'classic'
FROM public.screens scr,
     (VALUES ('G'),('F'),('E'),('D'),('C'),('B'),('A')) AS r(row_label),
     generate_series(1, 18) AS n(num)

UNION ALL

-- Row P — Premium ₹200
SELECT scr.id, 'P', n.num, 'premium'
FROM public.screens scr,
     unnest(ARRAY[1,2,3,4,5,6,7,8,9,10,11]) AS n(num);

-- 7. Add new 2-tier constraint
ALTER TABLE public.seat_layout
  ADD CONSTRAINT seat_layout_category_check
  CHECK (category IN ('classic', 'premium'));

-- 8. Recreate seat_status for all existing shows
INSERT INTO public.seat_status (show_id, seat_layout_id, status)
SELECT sh.id, sl.id, 'available'
FROM public.shows sh
JOIN public.seat_layout sl ON sl.screen_id = sh.screen_id
ON CONFLICT (show_id, seat_layout_id) DO NOTHING;

-- 9. Verify — should show rows G,F,E,D,C,A,B,P
SELECT
  row_label,
  count(*)                                      AS total_seats,
  array_agg(DISTINCT category)                  AS categories,
  min(seat_number)                              AS first_seat,
  max(seat_number)                              AS last_seat
FROM public.seat_layout
GROUP BY row_label
ORDER BY CASE row_label
  WHEN 'G' THEN 1 WHEN 'F' THEN 2 WHEN 'E' THEN 3
  WHEN 'D' THEN 4 WHEN 'C' THEN 5 WHEN 'B' THEN 6
  WHEN 'A' THEN 7 WHEN 'P' THEN 8
END;
