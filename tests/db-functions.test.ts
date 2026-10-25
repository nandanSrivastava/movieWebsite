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
    for (const file of ['002_launch_hardening.sql', '004_abuse_and_performance.sql', '005_profile_privacy.sql']) {
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

  it('caps one owner at 10 seats across shows', async () => {
    const other = await mkShow('2030-01-02');
    expect(await lock(show, seats.slice(10, 20), owner(4))).toBe('ok');
    expect(await lock(other, [seats[30]], owner(4))).toBe('owner_cap');
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

describe('schema.sql safety guard', () => {
  it('refuses to run on a database that has bookings', async () => {
    await expect(db.exec(schemaSql)).rejects.toThrow(/would delete existing bookings/);
    expect(Number(await val(`select count(*) from bookings`))).toBeGreaterThan(0);
  });
});
