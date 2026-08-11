# Dhrub Talkies / CineBook — Required Changes Before Production

> **Verdict:** The app builds and the happy path works, but it is **not production-ready**.
> There is a critical payment vulnerability, seat locks that never expire in Supabase
> mode, an unwired email flow, and an Android build that cannot be produced.
> This document lists every change required, in priority order, with file references.

**Repo state at time of writing:** `main` @ `511885d` — mid-refactor, with uncommitted
changes on `db.ts`, checkout/seating/confirmation components, untracked refactor
scripts, and a committed `.backup` file.

**Checks run:** `next build` ✅ passes · `tsc --noEmit` ✅ passes · `eslint` ❌ 76 errors / 23 warnings · No test files exist.

---

## Severity legend

| Icon | Meaning |
|---|---|
| 🔴 BLOCKER | Must fix before any real traffic — fraud, data loss, or permanent breakage |
| 🟠 HIGH | Will cause lost revenue, blocked users, or data exposure in production |
| 🟡 MEDIUM | Missing expected feature or polish |
| 🟢 LOW | Hygiene / hardening / nice-to-have |

---

## 🔴 BLOCKERS

### B1. Payment webhook can be spoofed — free tickets

**Files:** `src/app/api/checkout/webhook/route.ts`

**Problem:** The webhook accepts an `x-mock-payment: true` header that skips Razorpay
signature verification, and this bypass is active **even when Razorpay is configured**:

```ts
const isMockTrigger = req.headers.get('x-mock-payment') === 'true';
if (isMockMode || !isRazorpayConfigured || isMockTrigger) { // ← bypass in production
```

Attack path (no auth required):
1. `POST /api/checkout/create-order` with a valid `showId` + `seatLayoutIds` → get a `bookingId`.
2. `POST /api/checkout/webhook` with header `x-mock-payment: true` and that `bookingId`.
3. The booking is marked `paid`, seats become `booked`, and a valid QR ticket is generated.

**Required change:**
- Remove the `isMockTrigger` bypass entirely, OR gate it behind an explicit
  development-only flag (e.g. `NEXT_PUBLIC_APP_ENV !== 'production'` AND `isMockMode`).
- In live mode, the webhook must **only** accept Razorpay-signed payloads.
- Add the same guard to any other route that consumes the header (search for `x-mock-payment`).
- Add a test proving a forged `x-mock-payment` request is rejected when Razorpay is configured.

---

### B2. Seat locks never expire in Supabase mode — seats permanently blocked

**Files:** `supabase/schema.sql`, `src/lib/mockDb.ts`

**Problem:** `public.sweep_expired_locks()` exists in the schema but **nothing schedules
it**. The mock DB sweeps every 10s in-process (`mockDb.ts` line ~22), but in live
Supabase mode a customer who locks seats and closes the tab blocks those seats forever:
`lock_seats` returns FALSE for any seat still `locked`, even past expiry.

**Required change (pick one):**
- Schedule `sweep_expired_locks()` via Supabase **pg_cron** (add to schema.sql:
  `SELECT cron.schedule('sweep-expired-locks', '* * * * *', 'SELECT public.sweep_expired_locks();')`),
  or
- Add a scheduled Supabase Edge Function / serverless cron that calls the RPC every minute.
- **Also:** add a safety net in `lock_seats` / `getSeatsForShow` so seats whose
  `lock_expires_at < NOW()` are treated as available even if the sweep hasn't run.

---

### B3. Ticket confirmation emails are dead code

**Files:** `src/lib/mailer.ts`, `src/app/api/checkout/webhook/route.ts`, `.env.local`

**Problem:** `sendEmail()` is **never called anywhere**. Nodemailer is installed and a
transporter is configured, but no code path sends mail. `.env.local` has **no SMTP_***
variables either. Meanwhile the confirmation UI tells users "Please check your email or
refresh" when payment confirmation is slow — but no email exists.

**Required change:**
- Call `sendEmail` in the webhook after `finalizeBooking` succeeds, sending a ticket
  confirmation with the booking summary + QR (see `DigitalTicketStub` for the layout).
- Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` to `.env.local` (and document
  in `.env.example`).
- Make the confirmation-page "check your email" copy conditional on email actually
  being configured, or drop it.

---

## 🟠 HIGH

### H1. No fallback if the Razorpay webhook is missed or delayed

**Files:** `src/app/booking/checkout/page.tsx`, `src/app/api/bookings/status/route.ts`

**Problem:** The Razorpay `handler` callback ignores the payment response
(`razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`) and just redirects to
the confirmation page, which polls `/api/bookings/status` 20 × 1.5s and then gives up.
If Razorpay's webhook is delayed or misconfigured, the customer is **charged** but sees
"pending" forever and never gets a ticket.

**Required change:**
- In the `handler`, verify the payment signature client-side (Razorpay provides
  `razorpay_signature`; validate with the webhook secret) and/or
- Add a `POST /api/bookings/verify-payment` endpoint that calls the Razorpay API
  (`payments.fetch`) to confirm the order is paid, then runs `confirm_booking` +
  `finalize_booking` as a fallback when the webhook hasn't arrived.
- Increase/back-off the polling or surface a clear "contact support" state after timeout.

---

### H2. Silent fallback to the mock database in production

**Files:** `src/lib/db.ts`, `src/lib/config.ts`

**Problem:** When `NEXT_PUBLIC_SUPABASE_URL`/key are missing, the app silently switches
to an in-memory `MockDatabase`. In production this is a footgun: an accidentally missing
env var makes the site "work" while bookings vanish on restart and payments
fake-succeed via the mock gateway.

**Required change:**
- In production (`NODE_ENV === 'production'`), throw at startup if Supabase is not
  configured instead of falling back to mock.
- Keep the mock fallback only for development, driven by an explicit flag
  (e.g. `NEXT_PUBLIC_APP_ENV=development`), never by env-var absence alone.

---

### H3. Booking status/details endpoint is unauthenticated

**Files:** `src/app/api/bookings/status/route.ts`

**Problem:** Anyone with a booking UUID (which leaks via the confirmation URL) can read
the full booking record including **customer name and phone**.

**Required change:**
- Require the caller to be the booking owner (`booked_by === user.id`) or staff,
  or at minimum return only the `payment_status` to anonymous callers.

---

### H4. Admin revenue stat always shows ₹0

**Files:** `src/app/admin/dashboard/page.tsx`

**Problem:** `totalPaidRevenue` sums `log.details?.amount` from audit logs, but the
audit log entries written by the webhook store only `{ bookingId, orderId, paymentId }`
— no amount. Revenue is always zero.

**Required change:**
- Include `amount` (or `totalAmount`) in the `PAYMENT_CAPTURE_SUCCESS` /
  `BOOKING_CONFIRM_CASH_POS` audit log payloads, and/or compute revenue from the
  `bookings` table directly.

---

## 🟡 MEDIUM — missing features / product gaps

### M1. No "My Bookings" page for customers
- `DatabaseClient.getBookingsByUser()` exists (`src/lib/supabaseDb.ts` ~line 300) but
  is **never used**; there is no route where a logged-in user can see past tickets.
- **Add:** a `/account/bookings` page (or similar) listing the user's bookings with
  status, seats, and a QR re-download link, gated to the authenticated user.

### M2. "Forgot password?" is fake
- `src/app/login/page.tsx`: the button only shows a toast "Password reset link sent to
  your email." — nothing is sent.
- **Fix:** call `supabase.auth.resetPasswordForEmail()` in live mode (hide or mock in
  dev mode).

### M3. "Coming Soon" section is hardcoded with wrong data
- `src/app/page.tsx`: `upcomingMovies` is a hardcoded array with already-released films
  and odd dates (e.g. "Kalki 2898 AD — May 2026", released June 2024).
- **Fix:** back it by a real `upcoming_movies` table (admin-managed) or remove/update
  the static entries.

### M4. Mobile (Capacitor Android) build is not producible
- `capacitor.config.ts` sets `webDir: 'out'`, but `next.config.ts` has **no**
  `output: 'export'` and there is no `export` script — `next export` was removed in
  Next 16, so `out/` is never generated and `npx cap sync android` cannot work.
- **Fix:** either enable `output: 'export'` (requires all dynamic routes to become
  static or client-rendered — conflicts with `/api/*` and ISR) **or** change the
  Capacitor app to load the deployed web app (e.g. `server.url` pointing at the
  production domain) and update `webDir` accordingly.
- Verify `android/` syncs and builds after the change.

### M5. Refactor left in a half-finished state
- `src/app/admin/dashboard/page.tsx.backup` is **committed to git** — remove it.
- `scripts/refactor-*.js` are untracked dev utilities — decide keep/delete.
- Uncommitted changes on `db.ts`, checkout, seating, and confirmation components need
  review and a decision: commit or revert before branching further.

---

## 📧 Customer email suite (E1–E4) — added 2026-08-12

> Context: `src/lib/mailer.ts` (nodemailer `sendEmail`) is the in-app mailer. Supabase
> Auth emails (confirmation, reset links, OTPs) are sent by **Supabase's own email
> service**, NOT this mailer. Two viable architectures:
>
> **Option A (recommended for speed):** keep Supabase Auth emails for OTP/reset flows
> and configure the same SMTP credentials in the Supabase Dashboard
> (Authentication → SMTP Settings) so branding is consistent. Your mailer handles
> transactional mail (tickets, onboarding) only.
>
> **Option B (full custom mailer):** disable Supabase emails, generate/verify OTPs
> yourself (store hash + expiry in a `email_otps` table or Supabase `user_otps`),
> and send everything through `sendEmail`. More control, more code to maintain.
>
> **Prerequisite for ALL of this:** add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
> `SMTP_PASS` to `.env.local` (currently absent — emails can't send at all) and to
> the deployed environment.

### E1. Email OTP for login / email verification — ❌ MISSING

- **Status:** no OTP flow exists. Login is email+password only.
- **Implement:** `supabase.auth.signInWithOtp({ email })` → send 6-digit OTP via
  Supabase (Option A) or custom generation + `sendEmail` (Option B); add a verify
  step (`supabase.auth.verifyOtp` or custom check) in a new `/verify` page; add an
  `app/auth/callback/route.ts` to exchange the OTP link/code for a session and
  redirect. Apply verification at signup and/or before first booking.

### E2. Booking ticket email — 🟡 PARTIAL

- **Status:** sent from the payment webhook only (`src/app/api/checkout/webhook/route.ts`,
  `SMTP_USER`-gated) — online bookings with a logged-in user. Gaps:
  - No QR **image** in the email — only the raw `qr_code_token` text; embed the
    QR data-URL (`/api/checkout/qr` or `generateQRCodeDataUrl`) in the HTML.
  - No email for **cash/counter** sales (`create-order` cash branch never sends).
  - Anonymous online bookings fall back to the placeholder `customer@example.com`
    — collect an email at checkout or skip gracefully.
  - Email is plain HTML with no ticket styling; reuse the `DigitalTicketStub`
    layout for a branded stub.

### E3. Forgot-password OTP — ❌ MISSING (Supabase link only)

- **Status:** `resetPasswordForEmail()` (login page) delegates to Supabase's built-in
  email — no OTP via the in-app mailer, and **no callback page** exists, so the
  emailed reset link currently has nowhere to land.
- **Implement (Option A):** add `app/auth/callback/route.ts` (exchange code for
  session) + an `/reset-password` page where the user sets a new password
  (`supabase.auth.updateUser`). Supabase sends the reset email with the configured
  SMTP branding.
- **Implement (Option B):** custom OTP: generate, store hashed with expiry, send via
  `sendEmail`, verify, then allow password update.

### E4. Onboarding / welcome email — ❌ MISSING

- **Status:** nothing fires on signup. `signUp()` in `AuthContext.tsx` completes and
  the UI just toasts "Registration successful".
- **Implement:** send a branded welcome email ("Thank you for choosing Dhrub
  Cineplex") after successful signup — via a Supabase database trigger calling an
  Edge Function (survives any client), or a one-time `sendEmail` call from the
  `signUp` flow using `user.email`. Include a short intro, what to expect (ticket
  emails, OTPs), and a CTA to browse movies.

---

## 🟢 LOW — hygiene / hardening

### L1. Lint fails
- `npm run lint` → 76 errors / 23 warnings, mostly `@typescript-eslint/no-explicit-any`
  (`src/lib/supabaseDb.ts`, `src/lib/mockDb.ts`, `src/lib/types.ts`,
  `src/features/movies/components/MovieCarousel.tsx`, `src/lib/db.ts`) plus unused
  vars (`rateLimit.ts`, `supabaseDb.ts` SeatLayout) and a `prefer-const`
  (`ToastContext.tsx`).
- **Fix:** replace `any` with proper types (or targeted `eslint-disable`), fix the
  trivial ones, and add lint to CI.

### L2. No tests at all
- There are zero `*.test.*`/`*.spec.*` files and no test runner in `package.json`.
- **Add at minimum:** webhook signature verification tests (positive + forged),
  seat-lock concurrency test (the schema already ships `scripts/test-concurrency.js`),
  and an idempotency test for duplicate webhook events.

### L3. Login page shows dev-only UI in production
- `src/app/login/page.tsx` always renders the "Dev Tip: In Mock Mode, log in with
  admin@cinebook.com…" box and logs `console.log('[LoginPage] Render state:'…)`.
- **Fix:** gate the tip on `isMockMode` and remove the debug log.

### L4. Hardening (recommended, not blocking)
- **Middleware live-mode guard** (`src/proxy.ts`) only checks for the presence of any
  `sb-` cookie, not that the user is actually staff — page-level only, since every
  admin API checks roles server-side. Consider checking role in middleware for UX.
- **In-memory rate limiter** (`src/lib/rateLimit.ts`) resets on redeploy and doesn't
  share state across instances — swap for an Upstash/Redis-backed limiter if scaling
  beyond one instance.
- **Webhook endpoint:** currently excluded from the CORS origin guard — correct for
  Razorpay, but ensure the guard on all *other* routes stays strict.
- **`/api/bookings/verify`** returns the full booking payload on a valid token — fine
  for counter scanning, but confirm the counter page (`/counter`) only surfaces what
  staff need.
- **`createBooking`** writes a placeholder `order_placeholder_*` Razorpay order id
  which is later overwritten — harmless, but consider making it nullable to avoid
  confusion in logs.
- **Schema is a full reset** (`supabase/schema.sql`) — move to Supabase migrations
  (e.g. `supabase/migrations/`) before production so you never re-run DROP TABLE.
- **Add `.env.example`** documenting every required variable (Supabase URL/anon/service
  key, Razorpay key/secret/webhook secret, SMTP settings) without real values.
- **Add `robots.txt` / `sitemap.xml`** (`app/robots.ts`, `app/sitemap.ts`).

---

## Suggested fix order (checklist)

- [ ] **B1** Remove webhook spoofing bypass (do first — active exploit)
- [ ] **B2** Schedule `sweep_expired_locks` (pg_cron or scheduled job)
- [ ] **B3** Wire ticket emails (SMTP env vars + `sendEmail` in webhook)
- [ ] **H1** Payment verification fallback endpoint
- [ ] **H2** Hard-fail on missing Supabase config in production
- [ ] **H3** Auth on `/api/bookings/status`
- [ ] **H4** Fix admin revenue calculation
- [ ] **M1–M5** My Bookings page, real password reset, upcoming-movies data, Capacitor
      build, cleanup of refactor leftovers
- [ ] **E1–E4** Email suite: SMTP vars in `.env.local`, OTP login verification, ticket
      email with QR image + cash-sale emails, forgot-password OTP/callback page,
      onboarding welcome email
- [ ] **L1–L3** Lint, tests, dev-UI cleanup
- [ ] **L4** Hardening items as time allows
- [ ] Re-run `next build`, `tsc --noEmit`, `eslint`; smoke-test a real Razorpay
      payment end-to-end (test mode) before going live

---

## Verification status — re-checked 2026-08-12

Re-ran `npm test`, `npm run lint`, `npm run build` on the current working tree
(uncommitted changes since `511885d`). Results: **tests 3/3 pass · lint 0 errors
(16 warnings) · build passes**. Status of each item:

| Item | Status | Notes |
|---|---|---|
| B1 webhook spoofing | ✅ FIXED | `x-mock-payment` now requires `NODE_ENV !== 'production' && isMockMode`; tests added (`tests/webhook.test.ts`). See R1 below. |
| B2 seat-lock sweeper | ✅ FIXED | pg_cron scheduled in `supabase/schema.sql` (`cron.schedule('sweep-expired-locks', '* * * * *', …)`). Must run against Supabase with pg_cron enabled. |
| B3 ticket emails | 🟡 PARTIAL | `sendEmail` wired into webhook (`SMTP_USER`-gated), `.env.example` documents SMTP vars — but **SMTP_* are still absent from `.env.local`**, so no mail will send yet. Counter/cash bookings & anonymous bookings fall back to placeholder email. |
| H1 payment fallback | ✅ FIXED | `POST /api/bookings/verify-payment` added (server-side Razorpay `payments.fetch` + order-match + confirm); checkout passes `paymentId` to confirmation page. Minor: after fallback confirms, the React Query cache isn't invalidated (page may stay on the spinner until focus/refetch); verify-payment has no idempotency guard vs. the webhook (both can `finalizeBooking`, regenerating the QR token). |
| H2 silent mock fallback | ✅ FIXED | `db.ts` now throws in production if Supabase unconfigured; mock requires explicit `NEXT_PUBLIC_APP_ENV=development`. **See R2** — the same misconfig footgun remains in `create-order`/`webhook`. |
| H3 booking status auth | ✅ FIXED | `/api/bookings/status` returns only `payment_status` to non-owners/staff (SSR cookie auth via `@supabase/ssr`). |
| H4 admin revenue | ✅ FIXED | `amount` added to `PAYMENT_CAPTURE_SUCCESS` + `BOOKING_CONFIRM_CASH_POS` audit payloads (historical logs will still show ₹0). |
| M1 My Bookings | 🟡 PARTIAL | `/account/bookings` added (SSR auth + `getBookingsByUser`). **Not linked from the Header** — users can't discover it. |
| M2 password reset | 🟡 PARTIAL | `resetPasswordForEmail()` now called in live mode; **no callback/reset-password page exists**, so the emailed link has nowhere to land unless Supabase redirects somewhere handled. |
| M3 upcoming movies | ✅ FIXED | Hardcoded list updated to plausible upcoming titles. Still static (no admin-managed table) — acceptable for now. |
| M4 Capacitor/Android | ❌ NOT ADDRESSED | `webDir: 'out'` with no `output: 'export'` — `out/` still never generated; `npx cap sync android` remains broken. |
| M5 refactor cleanup | 🟡 PARTIAL | `.backup` deleted ✅; refactor scripts + split-db.js still untracked. |
| L1 lint | ✅ FIXED | 0 errors / 16 warnings (several rules relaxed in `eslint.config.mjs`). |
| L2 tests | ✅ FIXED | Vitest + `tests/webhook.test.ts` (missing signature, forged signature, valid signature). Seat-lock concurrency test still absent. |
| L3 login dev UI | ✅ FIXED | Dev tip gated on `isMockMode`, debug `console.log` removed. |
| L4 hardening | 🟡 PARTIAL | `robots.txt` + `sitemap.xml` added ✅, `.env.example` added ✅. In-memory rate limiter, middleware role check, migrations, and verify-endpoint payload still open. |

### Newly found items

- **R1 (webhook misconfig reopens B1):** if `RAZORPAY_WEBHOOK_SECRET` is missing in
  production, the webhook falls into the mock-deserialization branch — an ops mistake
  silently reopens the free-ticket hole. Webhook should return 503 in production when
  Razorpay isn't configured, never process mock-style.
- **R2 (create-order mock fallback in prod):** `create-order` returns `isMock: true`
  when Razorpay keys are missing, even in production — customers would see the mock
  gateway UI and a broken checkout. Should hard-fail (503) in production.
- **R3 (login page bundle regression):** `src/app/login/page.tsx` now imports
  `isMockMode` from `@/lib/db`, pulling the whole DB layer (mockDb + supabaseDb +
  supabase-js) into the client bundle — confirmed present in `.next/static/chunks`.
  Webpack shims `global`, so no crash and no secret leak, but switch the import back
  to `@/lib/config` (its stated purpose) to keep `db.ts` off the client bundle.

### Bottom line (2026-08-12)

Code-wise the three original blockers are genuinely fixed and the app builds/tests
clean. **Still before go-live:** add SMTP_* to the deployed env (B3), apply R1/R2 so
misconfiguration can't silently reopen the payment hole, decide on the Capacitor
build (M4), and smoke-test a real Razorpay test-mode payment end-to-end.
