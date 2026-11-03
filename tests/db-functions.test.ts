// Runs supabase/schema.sql and every migration on a real (in-process) Postgres
// and checks the seat-hold, payment and permission rules the app relies on.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

// PGlite has no pg_cron; the sweep job is scheduled in production only
const schemaSql = read('supabase/schema.sql')
  .replace(/CREATE EXTENSION IF NOT EXISTS pg_cron;/, '')
  .replace(/^SELECT cron\.schedule.*$/m, '');

const SUPABASE_STUBS = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  -- Supabase's defaults: new tables and functions are granted to the API roles
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`;

const SCREEN = 'a9f1a0e7-3f36-41b2-bb5b-43a0e698889c';
const MOVIE = 'd798a3b8-6c84-4828-98e3-50ebbc2a1d21';
const owner = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

let db: PGlite;
let seats: string[];

const val = async <T = unknown>(sql: string, params: unknown[] = []): Promise<T> =>
  Object.values((await db.query<Record<string, T>>(sql, params)).rows[0])[0];

const mkShow = async (date: string) => {
  const id = await val<string>(
    `insert into shows (movie_id, screen_id, show_date, show_time) values ($1, $2, $3, '20:30') returning id`,
    [MOVIE, SCREEN, date]
  );
  await db.query(`insert into seat_status (show_id, seat_layout_id) select $1, id from seat_layout where screen_id = $2`, [id, SCREEN]);
  return id;
};

const lock = (show: string, ids: string[], who: string, ip: string | null = null) =>
  val<string>(`select lock_seats($1, $2::uuid[], $3, $4)`, [show, ids, who, ip]);

const mkBooking = async (show: string, ids: string[], holdOwner: string | null) => {
  const id = await val<string>(`insert into bookings (show_id, hold_owner, total_amount) values ($1, $2, 150) returning id`, [show, holdOwner]);
  for (const seat of ids) await db.query(`insert into booking_seats (booking_id, seat_layout_id, price) values ($1, $2, 150)`, [id, seat]);
  return id;
};

const finalize = (bookingId: string, conflict = 'refund_pending') =>
  val<string>(`select finalize_payment($1::uuid, 'pay_1', $2, $3)`, [bookingId, `tkt_${bookingId}`, conflict]);

const asRole = async <T>(role: string, fn: () => Promise<T>, uid?: string): Promise<T> => {
  await db.exec(`SET ROLE ${role}`);
  if (uid) await db.exec(`SET request.jwt.uid = '${uid}'`);
  try {
    return await fn();
  } finally {
    await db.exec('RESET ROLE');
  }
};

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm } });
  await db.exec(SUPABASE_STUBS);
  await db.exec(schemaSql);
  for (const file of fs.readdirSync(path.join(root, 'supabase/migrations')).sort()) {
    if (file.includes('scheduled_jobs')) continue; // needs pg_cron / pg_net / vault
    await db.exec(read(`supabase/migrations/${file}`));
  }
  seats = (await db.query<{ id: string }>(`select id from seat_layout order by row_label, seat_number`)).rows.map(r => r.id);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('database migrations', () => {
  it('seeds the 137-seat hall', async () => {
    expect(Number(await val(`select count(*) from seat_layout`))).toBe(137);
  });

  it('can run every migration twice without errors', async () => {
    for (const file of ['002_launch_hardening.sql', '004_abuse_and_performance.sql', '005_profile_privacy.sql', '006_payment_and_hold_fixes.sql']) {
      await expect(db.exec(read(`supabase/migrations/${file}`))).resolves.not.toThrow();
    }
  });
});

describe('lock_seats', () => {
  let show: string;
  beforeAll(async () => { show = await mkShow('2030-01-01'); });

  it('holds free seats and refuses seats someone else holds', async () => {
    expect(await lock(show, [seats[0], seats[1]], owner(1))).toBe('ok');
    expect(await lock(show, [seats[1]], owner(2))).toBe('taken');
  });

  it('lets an owner re-select, releasing the seats they dropped', async () => {
    expect(await lock(show, [seats[0], seats[1]], owner(1))).toBe('ok');
    expect(await lock(show, [seats[2]], owner(1))).toBe('ok');
    expect(Number(await val(`select count(*) from seat_status where show_id = $1 and locked_by = $2`, [show, owner(1)]))).toBe(1);
  });

  it('rejects empty, oversized and foreign seat lists', async () => {
    expect(await lock(show, [], owner(3))).toBe('invalid');
    expect(await lock(show, seats.slice(10, 21), owner(3))).toBe('invalid');
    expect(await lock(show, [owner(99)], owner(3))).toBe('invalid');
  });

  it('caps one owner at 10 seats across shows: picking seats on another show lets the old ones go', async () => {
    const other = await mkShow('2030-01-02');
    expect(await lock(show, seats.slice(10, 20), owner(4))).toBe('ok');
    expect(await lock(other, [seats[30]], owner(4))).toBe('ok');
    expect(Number(await val(`select count(*) from seat_status where show_id = $1 and locked_by = $2`, [show, owner(4)]))).toBe(0);
    expect(Number(await val(`select count(*) from seat_status where locked_by = $1 and status = 'locked'`, [owner(4)]))).toBe(1);
  });

  it('keeps holds on another show while the total stays within 10', async () => {
    const other = await mkShow('2030-01-04');
    expect(await lock(show, seats.slice(100, 104), owner(7))).toBe('ok');
    expect(await lock(other, seats.slice(104, 108), owner(7))).toBe('ok');
    expect(Number(await val(`select count(*) from seat_status where locked_by = $1 and status = 'locked'`, [owner(7)]))).toBe(8);
  });

  it('caps one IP at 24 held seats across guests', async () => {
    const s = await mkShow('2030-01-03');
    expect(await lock(s, seats.slice(40, 50), owner(11), '9.9.9.9')).toBe('ok');
    expect(await lock(s, seats.slice(50, 60), owner(12), '9.9.9.9')).toBe('ok');
    expect(await lock(s, seats.slice(60, 64), owner(13), '9.9.9.9')).toBe('ok');
    expect(await lock(s, [seats[70]], owner(14), '9.9.9.9')).toBe('ip_cap');
    expect(await lock(s, [seats[70]], owner(14), '1.2.3.4')).toBe('ok');
  });

  it('lets anyone take a seat whose hold has expired', async () => {
    await db.query(`update seat_status set lock_expires_at = now() - interval '1 minute' where show_id = $1 and seat_layout_id = $2`, [show, seats[0]]);
    expect(await lock(show, [seats[0]], owner(5))).toBe('ok');
  });

  it('refuses shows that have already started', async () => {
    const past = await mkShow('2020-01-01');
    expect(await lock(past, [seats[0]], owner(6))).toBe('show_started');
  });

  it('extends only the caller\'s own holds', async () => {
    expect(await val(`select extend_seat_holds($1, $2::uuid[], $3, 600)`, [show, [seats[2]], owner(1)])).not.toBeNull();
    expect(await val(`select extend_seat_holds($1, $2::uuid[], $3, 600)`, [show, [seats[2]], owner(2)])).toBeNull();
  });
});

describe('the hold window', () => {
  const secondsLeft = async (show: string, seat: string) =>
    Number(await val(`select extract(epoch from lock_expires_at - now()) from seat_status where show_id = $1 and seat_layout_id = $2`, [show, seat]));
  const windowStartedAgo = (show: string, who: string, ago: string) =>
    db.query(`update hold_windows set started_at = now() - $3::interval where show_id = $1 and owner = $2`, [show, who, ago]);
  const lastHeldAgo = (show: string, who: string, ago: string) =>
    db.query(`update hold_windows set last_held_until = now() - $3::interval where show_id = $1 and owner = $2`, [show, who, ago]);

  it('stops pressing Pay from holding a seat forever', async () => {
    const show = await mkShow('2030-04-01');
    expect(await lock(show, [seats[0]], owner(90))).toBe('ok');
    await windowStartedAgo(show, owner(90), '24 minutes 30 seconds');
    const until = await val<string>(`select extend_seat_holds($1, $2::uuid[], $3, 720)`, [show, [seats[0]], owner(90)]);
    expect(new Date(until).getTime() - Date.now()).toBeLessThan(31_000);
  });

  it('won\'t extend past the limit at all', async () => {
    const show = await mkShow('2030-04-02');
    expect(await lock(show, [seats[0]], owner(91))).toBe('ok');
    await windowStartedAgo(show, owner(91), '26 minutes');
    expect(await val(`select extend_seat_holds($1, $2::uuid[], $3, 720)`, [show, [seats[0]], owner(91)])).toBeNull();
  });

  it('refuses another hold until a cool-down has passed, so it can\'t just be restarted', async () => {
    const show = await mkShow('2030-04-03');
    expect(await lock(show, [seats[0]], owner(92))).toBe('ok');
    await windowStartedAgo(show, owner(92), '26 minutes');
    await lastHeldAgo(show, owner(92), '1 minute');
    expect(await lock(show, [seats[0]], owner(92))).toBe('hold_limit');
    await lastHeldAgo(show, owner(92), '11 minutes');
    expect(await lock(show, [seats[0]], owner(92))).toBe('ok');
  });

  it('doesn\'t punish someone who walked away and came back later', async () => {
    const show = await mkShow('2030-04-08');
    expect(await lock(show, [seats[0]], owner(97))).toBe('ok');
    await db.query(`update seat_status set lock_expires_at = now() - interval '18 minutes' where show_id = $1`, [show]);
    await windowStartedAgo(show, owner(97), '26 minutes');
    await lastHeldAgo(show, owner(97), '18 minutes');
    expect(await lock(show, [seats[0]], owner(97))).toBe('ok');
    expect(await secondsLeft(show, seats[0])).toBeGreaterThan(400);
  });

  it('letting go and re-picking straight away doesn\'t restart the clock', async () => {
    const show = await mkShow('2030-04-09');
    expect(await lock(show, [seats[0]], owner(98))).toBe('ok');
    await windowStartedAgo(show, owner(98), '24 minutes');
    await val(`select release_seat_holds($1::uuid, $2::uuid[], $3)`, [show, [seats[0]], owner(98)]);
    expect(await lock(show, [seats[0]], owner(98))).toBe('ok');
    expect(await secondsLeft(show, seats[0])).toBeLessThan(61);
  });

  it('counts the cool-down from when seats were let go', async () => {
    const show = await mkShow('2030-04-10');
    expect(await lock(show, [seats[0], seats[1]], owner(99))).toBe('ok');
    await val(`select release_seat_holds($1::uuid, $2::uuid[], $3)`, [show, [seats[0]], owner(99)]);
    expect(Number(await val(`select extract(epoch from last_held_until - now()) from hold_windows where show_id = $1 and owner = $2`, [show, owner(99)]))).toBeGreaterThan(400);
    await val(`select release_seat_holds($1::uuid, $2::uuid[], $3)`, [show, [seats[1]], owner(99)]);
    expect(Number(await val(`select extract(epoch from last_held_until - now()) from hold_windows where show_id = $1 and owner = $2`, [show, owner(99)]))).toBeLessThan(1);
  });

  it('never lets a hold outlast its window, however often seats are re-picked', async () => {
    const show = await mkShow('2030-04-04');
    expect(await lock(show, [seats[0]], owner(93))).toBe('ok');
    await windowStartedAgo(show, owner(93), '24 minutes');
    expect(await lock(show, [seats[0]], owner(93))).toBe('ok');
    expect(await secondsLeft(show, seats[0])).toBeLessThan(61);
  });

  it('doesn\'t limit counter staff, who sell all day from one login', async () => {
    const show = await mkShow('2030-04-05');
    await db.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [owner(94)]);
    await db.query(`insert into profiles (id, email, role) values ($1, 'st@x.in', 'member') on conflict (id) do update set role = 'member'`, [owner(94)]);
    expect(await lock(show, [seats[0]], owner(94))).toBe('ok');
    expect(Number(await val(`select count(*) from hold_windows where owner = $1`, [owner(94)]))).toBe(0);
  });

  it('re-picking in a second tab doesn\'t cut short a hold a payment relies on', async () => {
    const show = await mkShow('2030-04-06');
    expect(await lock(show, [seats[0]], owner(95))).toBe('ok');
    await val(`select extend_seat_holds($1, $2::uuid[], $3, 720)`, [show, [seats[0]], owner(95)]);
    expect(await lock(show, [seats[0]], owner(95))).toBe('ok');
    expect(await secondsLeft(show, seats[0])).toBeGreaterThan(700);
  });

  it('a confirmed purchase ends the window, so they can buy more seats', async () => {
    const show = await mkShow('2030-04-07');
    expect(await lock(show, [seats[0]], owner(96))).toBe('ok');
    const booking = await mkBooking(show, [seats[0]], owner(96));
    expect(await finalize(booking)).toBe('confirmed');
    expect(Number(await val(`select count(*) from hold_windows where owner = $1`, [owner(96)]))).toBe(0);
  });
});

describe('letting seats go', () => {
  const release = (show: string | null, ids: string[] | null, who: string) =>
    val<number>(`select release_seat_holds($1::uuid, $2::uuid[], $3)`, [show, ids, who]);

  it('frees only the caller\'s own seats', async () => {
    const show = await mkShow('2030-05-01');
    expect(await lock(show, [seats[0], seats[1]], owner(100))).toBe('ok');
    expect(await release(show, [seats[0]], owner(101))).toBe(0);
    expect(await release(show, [seats[0]], owner(100))).toBe(1);
    expect(await val(`select status from seat_status where show_id = $1 and seat_layout_id = $2`, [show, seats[0]])).toBe('available');
    expect(await val(`select status from seat_status where show_id = $1 and seat_layout_id = $2`, [show, seats[1]])).toBe('locked');
  });

  it('can release everything at once, on every show, at sign-out', async () => {
    const a = await mkShow('2030-05-02');
    const b = await mkShow('2030-05-03');
    expect(await lock(a, [seats[0]], owner(102))).toBe('ok');
    expect(await lock(b, [seats[0]], owner(102))).toBe('ok');
    expect(await release(null, null, owner(102))).toBe(2);
  });

  it('a payment that lands after the customer let go is refunded, not a surprise ticket', async () => {
    const show = await mkShow('2030-05-04');
    expect(await lock(show, [seats[0]], owner(103))).toBe('ok');
    const booking = await mkBooking(show, [seats[0]], owner(103));
    await release(show, [seats[0]], owner(103));
    expect(await finalize(booking)).toBe('conflict');
    const row = await db.query<{ payment_status: string; refund_reason: string }>(`select payment_status, refund_reason from bookings where id = $1`, [booking]);
    expect(row.rows[0]).toEqual({ payment_status: 'refund_pending', refund_reason: 'customer_changed_seats' });
  });

  it('picking different seats gives up the old attempt, so its late payment is refunded', async () => {
    const show = await mkShow('2030-05-05');
    expect(await lock(show, [seats[0]], owner(104))).toBe('ok');
    const old = await mkBooking(show, [seats[0]], owner(104));
    expect(await lock(show, [seats[1]], owner(104))).toBe('ok');
    expect(await val(`select superseded_at is not null from bookings where id = $1`, [old])).toBe(true);
    expect(await finalize(old)).toBe('conflict');
  });

  it('re-picking the same seats keeps the attempt alive', async () => {
    const show = await mkShow('2030-05-06');
    expect(await lock(show, [seats[0], seats[1]], owner(105))).toBe('ok');
    const booking = await mkBooking(show, [seats[0], seats[1]], owner(105));
    expect(await lock(show, [seats[1], seats[0]], owner(105))).toBe('ok');
    expect(await val(`select superseded_at is null from bookings where id = $1`, [booking])).toBe(true);
    expect(await finalize(booking)).toBe('confirmed');
  });
});

describe('signing in during checkout', () => {
  it('moves the guest\'s seats, unpaid booking and window to the account', async () => {
    await db.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [owner(111)]);
    await db.query(`insert into profiles (id, email, role) values ($1, 'c11@x.in', 'user') on conflict (id) do nothing`, [owner(111)]);
    const show = await mkShow('2030-06-01');
    expect(await lock(show, [seats[0]], owner(110))).toBe('ok');
    const started = await val<string>(`select started_at from hold_windows where owner = $1`, [owner(110)]);
    const booking = await mkBooking(show, [seats[0]], owner(110));
    expect(await val(`select adopt_guest_holds($1, $2)`, [owner(110), owner(111)])).toBe(1);
    expect(await val(`select locked_by from seat_status where show_id = $1 and seat_layout_id = $2`, [show, seats[0]])).toBe(owner(111));
    expect(await val(`select hold_owner from bookings where id = $1`, [booking])).toBe(owner(111));
    // Signing in doesn't restart the clock
    expect(await val(`select started_at from hold_windows where owner = $1`, [owner(111)])).toEqual(started);
    expect(await finalize(booking)).toBe('confirmed');
  });

  it('leaves a guest\'s paid tickets alone: the next person on a shared phone doesn\'t collect them', async () => {
    await db.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [owner(113)]);
    await db.query(`insert into profiles (id, email, role) values ($1, 'c13@x.in', 'user') on conflict (id) do nothing`, [owner(113)]);
    const show = await mkShow('2030-06-02');
    expect(await lock(show, [seats[0]], owner(112))).toBe('ok');
    const booking = await mkBooking(show, [seats[0]], owner(112));
    expect(await finalize(booking)).toBe('confirmed');
    await val(`select adopt_guest_holds($1, $2)`, [owner(112), owner(113)]);
    expect(await val(`select hold_owner from bookings where id = $1`, [booking])).toBe(owner(112));
  });
});

describe('finalize_payment', () => {
  let show: string;
  beforeAll(async () => { show = await mkShow('2030-02-01'); });

  it('confirms the owner\'s held seats once, and is idempotent', async () => {
    expect(await lock(show, [seats[0]], owner(30))).toBe('ok');
    const booking = await mkBooking(show, [seats[0]], owner(30));
    expect(await finalize(booking)).toBe('confirmed');
    expect(await finalize(booking)).toBe('already_paid');
    const row = await db.query<{ payment_status: string; mine: boolean }>(
      `select b.payment_status, s.booking_id = b.id as mine from bookings b join seat_status s on s.show_id = b.show_id and s.seat_layout_id = $2 where b.id = $1`,
      [booking, seats[0]]
    );
    expect(row.rows[0]).toEqual({ payment_status: 'paid', mine: true });
  });

  it('queues a refund instead of double-selling a sold seat', async () => {
    const late = await mkBooking(show, [seats[0]], owner(31));
    expect(await finalize(late)).toBe('conflict');
    expect(await val(`select payment_status from bookings where id = $1`, [late])).toBe('refund_pending');
    expect(await finalize(late)).toBe('refunding');
  });

  it('still confirms a late payment if nobody took the seat', async () => {
    const booking = await mkBooking(show, [seats[5]], owner(32));
    expect(await finalize(booking)).toBe('confirmed');
  });

  it('marks an unpaid cash sale failed when the seat is held by someone else', async () => {
    expect(await lock(show, [seats[6]], owner(40))).toBe('ok');
    const booking = await mkBooking(show, [seats[6]], owner(41));
    expect(await finalize(booking, 'failed')).toBe('conflict');
    expect(await val(`select payment_status from bookings where id = $1`, [booking])).toBe('failed');
  });

  it('feeds the admin totals', async () => {
    const summary = await db.query<{ paid_bookings: string; refunds_pending: string }>(`select * from admin_sales_summary()`);
    expect(Number(summary.rows[0].paid_bookings)).toBeGreaterThanOrEqual(2);
    expect(Number(summary.rows[0].refunds_pending)).toBeGreaterThanOrEqual(1);
  });
});

describe('create_pending_booking', () => {
  let show: string;
  const create = async (who: string, ids: string[], key: string) =>
    (await db.query<{ r: any }>(
      `select create_pending_booking($1, $2::uuid[], null, $3, 'online', 'Asha', '9876543210', null, $4, 720) as r`,
      [show, ids, who, key]
    )).rows[0].r;

  beforeAll(async () => { show = await mkShow('2030-03-01'); });

  it('creates a priced booking from the caller\'s holds, without internal columns', async () => {
    expect(await lock(show, [seats[0], seats[130]], owner(60))).toBe('ok');
    const r = await create(owner(60), [seats[0], seats[130]], 'key-a');
    expect(r.status).toBe('ok');
    expect(Number(r.booking.total_amount)).toBe(150 + 200); // classic row A + premium row P
    expect(r.booking.access_key).toHaveLength(64);
    expect(r.booking.hold_owner).toBeUndefined();
    expect(r.booking.client_idempotency_key).toBeUndefined();
    expect(r.hold_expires_at).not.toBeNull();
  });

  it('returns the same booking for a retried key, but never to someone else', async () => {
    const first = await create(owner(60), [seats[0], seats[130]], 'key-a');
    expect(first.status).toBe('existing');
    await lock(show, [seats[5]], owner(61));
    const hijack = await create(owner(61), [seats[5]], 'key-a');
    expect(hijack.status).toBe('invalid');
    expect(hijack.booking).toBeUndefined();
  });

  it('reuses one pending booking when the same seats are submitted with a new key', async () => {
    const a = await create(owner(60), [seats[130], seats[0]], 'key-b');
    const b = await create(owner(60), [seats[0], seats[130]], 'key-c');
    expect(a.status).toBe('existing');
    expect(b.booking.id).toBe(a.booking.id);
    expect(Number(await val(`select count(*) from bookings where hold_owner = $1`, [owner(60)]))).toBe(1);
  });

  it('refuses seats the caller does not hold', async () => {
    expect((await create(owner(62), [seats[0]], 'key-d')).status).toBe('hold_expired');
  });

  it('saves details corrected on a retry, so the ticket goes to the right address', async () => {
    const s = await mkShow('2030-03-02');
    expect(await lock(s, [seats[0]], owner(63))).toBe('ok');
    const call = (email: string) => db.query<{ r: any }>(
      `select create_pending_booking($1, $2::uuid[], null, $3, 'online', 'Asha', '9876543210', $4, 'key-mistyped', 720) as r`,
      [s, [seats[0]], owner(63), email]
    );
    await call('asha@gmial.com');
    const corrected = (await call('asha@gmail.com')).rows[0].r;
    expect(corrected.status).toBe('existing');
    expect(corrected.booking.customer_email).toBe('asha@gmail.com');
  });

  it('refuses a retried key for different seats', async () => {
    const s = await mkShow('2030-03-03');
    expect(await lock(s, [seats[0], seats[1]], owner(64))).toBe('ok');
    const call = (ids: string[]) => db.query<{ r: any }>(
      `select create_pending_booking($1, $2::uuid[], null, $3, 'online', 'Asha', '9876543210', null, 'key-seats', 720) as r`,
      [s, ids, owner(64)]
    );
    expect((await call([seats[0]])).rows[0].r.status).toBe('ok');
    expect((await call([seats[0], seats[1]])).rows[0].r.status).toBe('invalid');
  });
});

describe('a refund made in the Razorpay dashboard', () => {
  const refund = (booking: string, payment: string) =>
    val<string>(`select record_external_refund($1::uuid, $2, 'rfnd_1')`, [booking, payment]);

  it('ends the ticket and puts the seats back on sale', async () => {
    const show = await mkShow('2030-07-01');
    expect(await lock(show, [seats[0]], owner(120))).toBe('ok');
    const booking = await mkBooking(show, [seats[0]], owner(120));
    expect(await finalize(booking)).toBe('confirmed');
    expect(await refund(booking, 'pay_1')).toBe('refunded');
    const row = await db.query<{ payment_status: string; refund_reason: string }>(`select payment_status, refund_reason from bookings where id = $1`, [booking]);
    expect(row.rows[0]).toEqual({ payment_status: 'refunded', refund_reason: 'refunded_by_cinema' });
    expect(await val(`select status from seat_status where show_id = $1 and seat_layout_id = $2`, [show, seats[0]])).toBe('available');
  });

  it('ignores a refund of some other payment, and one that already happened', async () => {
    const show = await mkShow('2030-07-02');
    expect(await lock(show, [seats[0]], owner(121))).toBe('ok');
    const booking = await mkBooking(show, [seats[0]], owner(121));
    expect(await finalize(booking)).toBe('confirmed');
    expect(await refund(booking, 'pay_other')).toBe('ignored');
    expect(await val(`select payment_status from bookings where id = $1`, [booking])).toBe('paid');
    expect(await refund(booking, 'pay_1')).toBe('refunded');
    expect(await refund(booking, 'pay_1')).toBe('ignored');
  });
});

describe('cancelling a show', () => {
  const cancel = async (show: string) => (await db.query<{ r: any }>(`select cancel_show($1) as r`, [show])).rows[0].r;

  it('simply deletes a show nobody tried to book', async () => {
    const show = await mkShow('2030-08-01');
    expect((await cancel(show)).status).toBe('deleted');
    expect(Number(await val(`select count(*) from shows where id = $1`, [show]))).toBe(0);
  });

  it('can cancel a show with dead unpaid bookings on it', async () => {
    const show = await mkShow('2030-08-02');
    await mkBooking(show, [seats[0]], owner(130));
    expect((await cancel(show)).status).toBe('cancelled');
  });

  it('queues online refunds, marks cash for the counter, and frees holds', async () => {
    const show = await mkShow('2030-08-03');
    expect(await lock(show, [seats[0]], owner(131))).toBe('ok');
    const online = await mkBooking(show, [seats[0]], owner(131));
    expect(await finalize(online)).toBe('confirmed');

    expect(await lock(show, [seats[1]], owner(132))).toBe('ok');
    const cash = await mkBooking(show, [seats[1]], owner(132));
    expect(await val(`select finalize_payment($1::uuid, 'pay_cash_1', 'tkt_c', 'failed')`, [cash])).toBe('confirmed');

    expect(await lock(show, [seats[2]], owner(133))).toBe('ok');

    expect(await cancel(show)).toEqual({ status: 'cancelled', online_refunds: 1, cash_refunds: 1 });
    expect(await val(`select payment_status from bookings where id = $1`, [online])).toBe('refund_pending');
    expect(await val(`select refund_reason from bookings where id = $1`, [cash])).toBe('show_cancelled_cash');
    expect(await val(`select status from seat_status where show_id = $1 and seat_layout_id = $2`, [show, seats[2]])).toBe('available');
  });

  it('a payment still on its way when the show is cancelled gets refunded', async () => {
    const show = await mkShow('2030-08-04');
    expect(await lock(show, [seats[0]], owner(134))).toBe('ok');
    const booking = await mkBooking(show, [seats[0]], owner(134));
    await cancel(show);
    expect(await finalize(booking)).toBe('conflict');
    expect(await val(`select refund_reason from bookings where id = $1`, [booking])).toBe('show_cancelled');
  });

  it('nothing more can be held or bought on it', async () => {
    const show = await mkShow('2030-08-05');
    await mkBooking(show, [seats[0]], owner(135));
    await cancel(show);
    expect(await lock(show, [seats[1]], owner(136))).toBe('invalid');
  });

  it('frees the slot so it can be scheduled again', async () => {
    const show = await mkShow('2030-08-06');
    await mkBooking(show, [seats[0]], owner(137));
    await cancel(show);
    await expect(mkShow('2030-08-06')).resolves.toBeTruthy();
  });

  it('still refuses two live shows in one slot', async () => {
    await mkShow('2030-08-07');
    await expect(mkShow('2030-08-07')).rejects.toThrow(/idx_shows_active_slot|duplicate/);
  });

  it('refuses a show that has already played, so nobody who watched it is refunded', async () => {
    const show = await mkShow('2020-03-01');
    const paid = await mkBooking(show, [seats[0]], owner(139));
    expect(await finalize(paid)).toBe('confirmed');
    expect((await cancel(show)).status).toBe('already_started');
    expect(await val(`select payment_status from bookings where id = $1`, [paid])).toBe('paid');
    expect(await val(`select cancelled_at is null from shows where id = $1`, [show])).toBe(true);
  });

  it('can still clear a past show that nobody paid for', async () => {
    const show = await mkShow('2020-03-02');
    await mkBooking(show, [seats[0]], owner(139));
    expect((await cancel(show)).status).toBe('cancelled');
    const untouched = await mkShow('2020-03-03');
    expect((await cancel(untouched)).status).toBe('deleted');
  });

  it('says so if the show is gone', async () => {
    expect((await cancel(owner(999))).status).toBe('not_found');
  });

  it('refuses a hidden film\'s shows too', async () => {
    const show = await mkShow('2030-08-08');
    await db.query(`update movies set is_active = false where id = $1`, [MOVIE]);
    try {
      expect(await lock(show, [seats[0]], owner(138))).toBe('invalid');
    } finally {
      await db.query(`update movies set is_active = true where id = $1`, [MOVIE]);
    }
  });
});

describe('rate_limit_hit', () => {
  it('allows up to the limit within a window', async () => {
    const hits = [];
    for (let i = 0; i < 4; i++) hits.push(await val(`select rate_limit_hit('test-key', 60, 3)`));
    expect(hits).toEqual([true, true, true, false]);
  });
});

describe('public anon key', () => {
  const denied = /permission denied|row-level security/;

  it('cannot call the seat or payment functions', async () => {
    await expect(asRole('anon', () => db.query(`select lock_seats($1, $2::uuid[], $3, null)`, [owner(0), [seats[0]], owner(1)]))).rejects.toThrow(denied);
    await expect(asRole('anon', () => db.query(`select finalize_payment($1::uuid, 'p', 't')`, [owner(0)]))).rejects.toThrow(denied);
  });

  it('can read the seat map but not who holds or bought a seat', async () => {
    await expect(asRole('anon', () => db.query(`select status from seat_status limit 1`))).resolves.toBeTruthy();
    await expect(asRole('anon', () => db.query(`select locked_by from seat_status limit 1`))).rejects.toThrow(denied);
    await expect(asRole('anon', () => db.query(`select booking_id from seat_status limit 1`))).rejects.toThrow(denied);
  });

  it('cannot write seats or touch rate limits', async () => {
    await expect(asRole('anon', () => db.query(`update seat_status set status = 'available'`))).rejects.toThrow(denied);
    await expect(asRole('anon', () => db.query(`select * from rate_limits`))).rejects.toThrow(denied);
  });

  it('cannot call the new hold, refund and cancel functions', async () => {
    for (const sql of [
      `select cancel_show($1::uuid)`,
      `select adopt_guest_holds($1::uuid, $1::uuid)`,
      `select release_seat_holds($1::uuid, null, $1::uuid)`,
      `select record_external_refund($1::uuid, 'p', 'r')`,
    ]) {
      await expect(asRole('anon', () => db.query(sql, [owner(0)]))).rejects.toThrow(denied);
    }
  });

  it('counter staff can\'t read bookings or ticket keys directly', async () => {
    const show = await mkShow('2030-09-01');
    await mkBooking(show, [seats[0]], owner(140));
    await db.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [owner(141)]);
    await db.query(`insert into profiles (id, email, role) values ($1, 'st2@x.in', 'member') on conflict (id) do update set role = 'member'`, [owner(141)]);
    const seen = await asRole('authenticated', () => db.query(`select access_key from bookings`), owner(141));
    expect(seen.rows).toEqual([]);
  });

  it('counter staff can no longer read other people\'s profiles; admins can', async () => {
    await db.query(`insert into auth.users (id) values ($1), ($2), ($3) on conflict do nothing`, [owner(80), owner(81), owner(82)]);
    await db.query(`insert into profiles (id, email, role) values ($1, 's@x.in', 'member'), ($2, 'c@x.in', 'user'), ($3, 'a@x.in', 'admin')
                    on conflict (id) do update set role = excluded.role`, [owner(80), owner(81), owner(82)]);
    const staffSees = await asRole('authenticated', () => db.query(`select id from profiles`), owner(80));
    expect(staffSees.rows.map((r: any) => r.id)).toEqual([owner(80)]);
    const adminSees = await asRole('authenticated', () => db.query(`select id from profiles`), owner(82));
    expect(adminSees.rows.length).toBeGreaterThanOrEqual(3);
  });

  it('a user can edit their name but not their email or role', async () => {
    await expect(asRole('authenticated', () => db.query(`update profiles set full_name = 'New Name' where id = $1`, [owner(81)]), owner(81))).resolves.toBeTruthy();
    await expect(asRole('authenticated', () => db.query(`update profiles set email = 'staff@x.in' where id = $1`, [owner(81)]), owner(81))).rejects.toThrow(denied);
    await expect(asRole('authenticated', () => db.query(`update profiles set role = 'admin' where id = $1`, [owner(81)]), owner(81))).rejects.toThrow(denied);
  });

  it('cannot create an admin profile for itself', async () => {
    await db.query(`insert into auth.users (id) values ($1)`, [owner(77)]);
    await expect(asRole('authenticated', () => db.query(`insert into profiles (id, role) values ($1, 'admin')`, [owner(77)]), owner(77))).rejects.toThrow(denied);
  });
});

describe('admitting a family that arrives separately', () => {
  const admit = (booking: string, count: number | null = null) =>
    val<number>(`select admit_seats($1::uuid, null, $2::int)`, [booking, count]);
  const row = async (booking: string) =>
    (await db.query<{ admitted_seats: number; used: boolean }>(`select admitted_seats, checked_in_at is not null as used from bookings where id = $1`, [booking])).rows[0];

  const paidFamily = async (date: string) => {
    const show = await mkShow(date);
    const booking = await mkBooking(show, [seats[0], seats[1], seats[2]], owner(160));
    expect(await finalize(booking)).toBe('confirmed');
    return booking;
  };

  it('lets some in now and the rest later, and only then marks the ticket used', async () => {
    const booking = await paidFamily('2030-11-01');
    expect(await admit(booking, 1)).toBe(1);
    expect(await row(booking)).toEqual({ admitted_seats: 1, used: false });
    expect(await admit(booking, null)).toBe(2);
    expect(await row(booking)).toEqual({ admitted_seats: 3, used: true });
    expect(await admit(booking, null)).toBe(0);
  });

  it('can never admit more people than the ticket has', async () => {
    const booking = await paidFamily('2030-11-02');
    expect(await admit(booking, 2)).toBe(2);
    expect(await admit(booking, 5)).toBe(1);
    expect((await row(booking)).admitted_seats).toBe(3);
  });

  it('admits everyone when no number is given, and refuses a ticket used before this column existed', async () => {
    const booking = await paidFamily('2030-11-03');
    expect(await admit(booking)).toBe(3);
    const older = await paidFamily('2030-11-04');
    await db.query(`update bookings set checked_in_at = now(), admitted_seats = 0 where id = $1`, [older]);
    expect(await admit(older)).toBe(0);
  });

  it('won\'t admit anyone on an unpaid ticket', async () => {
    const show = await mkShow('2030-11-05');
    expect(await admit(await mkBooking(show, [seats[0]], owner(161)))).toBe(0);
  });

  it('undo clears a partial entry and a full one, and says when there was nothing to undo', async () => {
    const booking = await paidFamily('2030-11-06');
    expect(await val(`select undo_admission($1::uuid)`, [booking])).toBe(false);
    await admit(booking, 1);
    expect(await val(`select undo_admission($1::uuid)`, [booking])).toBe(true);
    expect(await row(booking)).toEqual({ admitted_seats: 0, used: false });
    await admit(booking);
    expect(await val(`select undo_admission($1::uuid)`, [booking])).toBe(true);
    expect(await row(booking)).toEqual({ admitted_seats: 0, used: false });
  });

  it('is out of reach of the public key', async () => {
    await expect(asRole('anon', () => db.query(`select admit_seats($1::uuid, null, 1)`, [owner(0)]))).rejects.toThrow(/permission denied/);
    await expect(asRole('anon', () => db.query(`select undo_admission($1::uuid)`, [owner(0)]))).rejects.toThrow(/permission denied/);
  });
});

describe('re-running migration 006', () => {
  it('stops with a clear message if an earlier migration was never run', async () => {
    await db.exec(`begin; alter table bookings rename column hold_owner to hold_owner_gone;`);
    await expect(db.exec(read('supabase/migrations/006_payment_and_hold_fixes.sql'))).rejects.toThrow(/Run migrations 001 to 005 first/);
    await db.exec(`rollback;`);
    expect(await val(`select count(*) from information_schema.columns where table_name = 'bookings' and column_name = 'hold_owner'`)).toBeTruthy();
  });

  it('leaves a refund still waiting for its notice waiting', async () => {
    const show = await mkShow('2030-10-01');
    const booking = await mkBooking(show, [seats[0]], owner(150));
    await db.query(`update bookings set payment_status = 'refunded', refunded_at = now(), refund_email_sent_at = null where id = $1`, [booking]);
    await db.exec(read('supabase/migrations/006_payment_and_hold_fixes.sql'));
    expect(await val(`select refund_email_sent_at is null from bookings where id = $1`, [booking])).toBe(true);
  });
});

describe('schema.sql safety guard', () => {
  it('refuses to run on a database that has bookings', async () => {
    await expect(db.exec(schemaSql)).rejects.toThrow(/would delete existing bookings/);
    expect(Number(await val(`select count(*) from bookings`))).toBeGreaterThan(0);
  });
});
