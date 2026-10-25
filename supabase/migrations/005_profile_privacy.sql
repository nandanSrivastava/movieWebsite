-- ============================================================
-- DHRUB TALKIES — 005 PROFILE PRIVACY
-- Paste into: Supabase Dashboard → SQL Editor → New Query → RUN ▶
-- Run after 004_abuse_and_performance.sql. Safe to run more than once.
--
-- Found by permission testing with the public anon key:
--   • Counter staff could read every customer's and colleague's
--     profile (phone, email) directly from the database.
--   • Any signed-in user could rewrite the email on their profile,
--     which admins see in the staff list (spoofing).
-- The app reads other people's profiles only through the server.
-- ============================================================

-- Only admins may read profiles other than their own
DROP POLICY IF EXISTS "profiles: staff read all" ON public.profiles;
DROP POLICY IF EXISTS "profiles: admin read all" ON public.profiles;
CREATE POLICY "profiles: admin read all" ON public.profiles
  FOR SELECT USING (public.is_admin());

-- Users may change only their own name and phone. Email comes from the auth
-- account (handle_new_user); role changes go through the server.
REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, phone, updated_at) ON public.profiles TO authenticated;
GRANT INSERT (id, full_name, phone) ON public.profiles TO authenticated;

-- A trigger function; nobody needs to call it directly
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
