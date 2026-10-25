# Launch checklist

Work through this top to bottom: first everything in **Razorpay test mode**, then switch to live.

## 1. Database (Supabase → SQL Editor)

Run in order. Details in [supabase/README.md](supabase/README.md).

- [ ] `supabase/migrations/001_gate_checkin.sql`
- [ ] `supabase/migrations/002_launch_hardening.sql`
- [ ] `supabase/migrations/003_scheduled_jobs.sql` (replace `<APP_URL>` and `<CRON_SECRET>` first)
- [ ] `supabase/migrations/004_abuse_and_performance.sql`
- [ ] `supabase/migrations/005_profile_privacy.sql`
- [ ] Check the jobs: `SELECT jobname, schedule, active FROM cron.job;` shows three active jobs
- [ ] Backups: Point-in-Time Recovery or daily backups on (Supabase Pro)

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required.** Server only. The app refuses to start database calls without it |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | `rzp_test_…` now, `rzp_live_…` at go-live |
| `RAZORPAY_WEBHOOK_SECRET` | From the Razorpay webhook (step 3) |
| `CRON_SECRET` | New. Random string (`openssl rand -hex 32`); same value as in migration 003 |
| `NEXT_PUBLIC_SITE_URL` | New. Public address used in ticket-email links, e.g. `https://dhrubcineplex.in` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Use a transactional provider (Resend, Amazon SES, Postmark: all offer SMTP). Gmail stops at ~500 emails/day |
| `SMTP_FROM` | Optional sender, e.g. `"Dhrub Cineplex" <tickets@dhrubcineplex.in>` |
| `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`) | Error reporting; without a DSN Sentry stays off |
| `NEXT_PUBLIC_APP_ENV` | **Leave unset in production.** `development` switches to the in-memory mock database |

## 3. Razorpay (test mode first)

- [ ] Dashboard → Settings → **Payment capture: Automatic**
- [ ] Dashboard → Webhooks → Add: URL `https://<your-domain>/api/checkout/webhook`, events **`payment.captured`** and **`order.paid`**, set a secret → `RAZORPAY_WEBHOOK_SECRET`
- [ ] Redeploy so the new variables load

### Test-mode run-through (all must pass before going live)

| Scenario | How | Expected |
|---|---|---|
| Card payment | Test card from Razorpay docs | Ticket page shows QR; one ticket email |
| UPI success | VPA `success@razorpay` | Same as above |
| UPI failure | VPA `failure@razorpay` | Booking stays unpaid; seats free after the hold |
| Customer closes the tab right after paying | Pay, close the tab before the ticket page loads | Within 5 minutes the booking is paid and the email arrives (reconcile job) |
| Seats lost during payment | Hold seats, wait out the timer, book the same seats in another browser, then pay in the first | First payment is refunded automatically (Razorpay → Refunds) |
| Gate | Scan the emailed QR at `/counter` → Admit | Admitted once; a second scan says "already used" |
| Lost ticket | `/booking/lookup` with the phone number | Email with ticket links arrives; the page shows nothing about the booking |

Check `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;` shows the reconcile job succeeding.

## 4. Supabase Auth

- [ ] Auth → URL Configuration: Site URL = your domain; Redirect URLs include `https://<your-domain>/auth/callback**` (and the vercel.app URL)
- [ ] Auth → SMTP: custom SMTP (the built-in mailer only reaches team addresses, so customer sign-up and password-reset emails won't arrive)
- [ ] Try one real sign-up and one password reset

## 5. Before every deploy

- [ ] `npm audit --omit=dev` shows 0 vulnerabilities (Next.js 16.3.0 had remote-code-execution bugs; this repo is now on 16.4.3)
- [ ] Staff accounts: passwords are at least 10 characters (the onboarding form now enforces it)
- [ ] Supabase Auth → enable CAPTCHA on sign-up/sign-in if bots show up

## 6. Hosting

- [ ] Vercel function region close to the Supabase region (e.g. `bom1` for Mumbai): Project → Settings → Functions
- [ ] Vercel **Hobby is for non-commercial use** and has low monthly limits; selling tickets needs **Pro**
- [ ] Optional: run `scripts/load/seat-map.k6.js` against a staging deployment (never production)

## 7. Go live (switch Razorpay to your main account)

1. Complete Razorpay account activation (KYC, settlement bank account).
2. Switch the dashboard to **Live mode** → API Keys → generate live keys.
3. Webhooks are separate per mode: add the **same webhook again in Live mode** (same URL, same two events, new secret).
4. In Vercel → Production environment, replace `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` with the live values. Redeploy.
5. Make one real purchase with your own card or UPI, check the ticket and the email, then refund it from the Razorpay dashboard.
6. Delete any test bookings you don't want in reports (they're `pending`/`paid` rows made with test payments).
