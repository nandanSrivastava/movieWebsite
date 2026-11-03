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
| `migrations/006_payment_and_hold_fixes.sql` | A hard limit on how long seats stay held, seats carried over at sign-in, corrected details saved on retry, cancelling a sold show with refunds, dashboard refunds end the ticket, staff can't read bookings with the public key. **Run it before deploying the matching code** |

Every migration is safe to run twice. Never edit a migration that has already run in
production; add a new numbered file instead.

## Automatic from 006 onward

To add a migration, put a new numbered file in `migrations/` and deploy. The production
build runs `scripts/migrate.mjs` before the new code goes live, applies whatever hasn't run
yet, and records each file in `schema_migrations`. If one fails it's rolled back, the deploy
stops, and the live site stays as it is.

**To switch it on,** add two variables in Vercel → Project → Settings → Environment Variables,
for **Production only**:

| Variable | Value |
|---|---|
| `SUPABASE_DB_URL` | From Supabase → Connect → **Session pooler**, with your database password put in. The direct address is IPv6 only, which Vercel can't reach |
| `SUPABASE_DB_CA` | The text of the certificate from Supabase → Project Settings → Database → SSL configuration → Download certificate. The password travels over this connection, so the server's certificate is always checked |

Until `SUPABASE_DB_URL` is set, deploys skip this step and new migrations must be run by hand,
as above. Running a file by hand first is fine; it runs once more through the script, which is
safe.

**Rules for a new migration:**

- Keep the live code working. Old code serves customers until the build finishes, and rolling
  back a deploy in Vercel doesn't roll back the database. Add things first, and remove them in a
  later deploy.
- No `BEGIN` or `COMMIT` in the file, and no `CREATE INDEX CONCURRENTLY`: each file already runs
  in one transaction.
- Keep it safe to run twice, like the others.
- 001 to 005 are never run by this script. On a new database, run those by hand first.

## Fresh database (new project, local testing)

1. `schema.sql` — creates the tables and seeds the hall. It refuses to run if any booking
   exists, so it can't wipe production by accident.
2. Every file in `migrations/`, in order.

`migrate_hall_layout.sql` is a one-time historical script. It is already in production and
refuses to run again once bookings exist.

## Before launch

- Turn on **Point-in-Time Recovery** or daily backups (Supabase Pro).
- After running 003, check the jobs: `SELECT jobname, schedule, active FROM cron.job;`
