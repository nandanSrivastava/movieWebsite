-- ============================================================
-- DHRUB TALKIES — 003 SCHEDULED JOBS
-- Paste into: Supabase Dashboard → SQL Editor → New Query → RUN ▶
-- Run after 002_launch_hardening.sql. Safe to run more than once.
--
-- Vercel Hobby only runs crons once a day, so Supabase drives the
-- every-5-minute payment reconciliation instead (pg_cron + pg_net).
--
-- BEFORE RUNNING, replace the two placeholders below:
--   <APP_URL>      your site, e.g. https://dhrub-talkies.vercel.app
--   <CRON_SECRET>  the same random value you set as CRON_SECRET in
--                  Vercel → Project → Settings → Environment Variables
--                  (generate one with: openssl rand -hex 32)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Store the app URL and secret in Supabase Vault (encrypted at rest), not in
-- the job text. Re-running replaces the old values.
DO $$
BEGIN
  DELETE FROM vault.secrets WHERE name IN ('app_url', 'cron_secret');
  PERFORM vault.create_secret('<APP_URL>', 'app_url');
  PERFORM vault.create_secret('<CRON_SECRET>', 'cron_secret');
END $$;

-- Release expired seat holds every minute
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sweep-expired-locks';
SELECT cron.schedule('sweep-expired-locks', '* * * * *', $$SELECT public.sweep_expired_locks();$$);

-- Every 5 minutes: confirm payments whose webhook was missed, retry refunds,
-- send ticket emails that failed, expire abandoned bookings
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'reconcile-payments';
SELECT cron.schedule(
  'reconcile-payments',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_url') || '/api/cron/reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Hourly housekeeping: old rate-limit windows, webhook dedupe keys, and
-- seat-hold audit entries (one per hold; kept 30 days for abuse forensics)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'housekeeping';
SELECT cron.schedule(
  'housekeeping',
  '17 * * * *',
  $$
  DELETE FROM public.rate_limits WHERE window_start < NOW() - INTERVAL '1 day';
  DELETE FROM public.processed_webhook_events WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM public.audit_logs WHERE action = 'SEAT_LOCK' AND created_at < NOW() - INTERVAL '30 days';
  $$
);

-- Check: SELECT jobname, schedule, active FROM cron.job;
-- Last runs: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- HTTP results: SELECT * FROM net._http_response ORDER BY created DESC LIMIT 20;
