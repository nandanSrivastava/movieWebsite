-- ============================================================
-- DHRUB TALKIES — GATE CHECK-IN MIGRATION
-- Paste this into: Supabase Dashboard → SQL Editor → New Query
-- Then click RUN ▶   (safe to run more than once)
-- ============================================================

-- 1. Record when (and by whom) a ticket was admitted at the gate,
--    so the same ticket can't be used twice.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Digits-only copy of the customer phone, so gate staff can search
--    "98765" whether the number was saved as "+91 98765 43210" or "9876543210".
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_phone_digits TEXT
  GENERATED ALWAYS AS (regexp_replace(COALESCE(customer_phone, ''), '\D', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings(created_at DESC);
