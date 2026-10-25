# Database scripts

Run everything in **Supabase Dashboard → SQL Editor**.

## Existing database (production)

Production already has `schema.sql` and `migrate_hall_layout.sql` applied. Run only the
migrations it hasn't had yet, in order:

| File | What it does |
|---|---|
| `migrations/001_gate_checkin.sql` | Gate check-in columns, digits-only phone for search |
| `migrations/002_launch_hardening.sql` | Locks database functions to the server, seat-hold caps, atomic payment finalization, refund queue, email outbox, ticket-link keys, rate limits |
| `migrations/003_scheduled_jobs.sql` | Every-minute hold sweep, 5-minute payment reconciliation, hourly cleanup. **Edit the two placeholders first** (`<APP_URL>`, `<CRON_SECRET>`). |
| `migrations/004_abuse_and_performance.sql` | Seat-hold caps that hold under parallel requests, one atomic checkout step (no booking hijack via a replayed key, no duplicate bookings per click), indexed phone lookup and gate search |
| `migrations/005_profile_privacy.sql` | Counter staff can no longer read every customer's profile with the public key; users can't rewrite their profile email |

Every migration is safe to run twice. Never edit a migration that has already run in
production; add a new numbered file instead.

## Fresh database (new project, local testing)

1. `schema.sql` — creates the tables and seeds the hall. It refuses to run if any booking
   exists, so it can't wipe production by accident.
2. Every file in `migrations/`, in order.

`migrate_hall_layout.sql` is a one-time historical script. It is already in production and
refuses to run again once bookings exist.

## Before launch

- Turn on **Point-in-Time Recovery** or daily backups (Supabase Pro).
- After running 003, check the jobs: `SELECT jobname, schedule, active FROM cron.job;`
