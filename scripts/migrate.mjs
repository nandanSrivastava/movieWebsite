// Runs new database migrations during the production build, before the new code
// goes live. If one fails, the build fails: the site stays on the old version, and
// that migration is rolled back because each file runs in its own transaction.
//
// Off unless this is Vercel's production build and SUPABASE_DB_URL is set, so
// laptops and preview deployments never touch the database from here.
//
// Old code keeps serving customers until the build finishes, so a migration must
// keep the live code working: add things first, remove them in a later deploy.
// Files must not contain their own BEGIN or COMMIT. See supabase/README.md.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 001 to 005 predate this script and were run by hand, and 003 needs secrets pasted
// in. 006 checks for itself that they ran, and stops the deploy if they didn't.
const FIRST_AUTOMATIC = 6;
const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const LOCK_KEY = 8271640;

const TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name       TEXT PRIMARY KEY,
    checksum   TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.schema_migrations FROM anon, authenticated;
`;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** The migration files this script is responsible for, in order. */
export function readMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .filter((name) => /^\d+_.*\.sql$/.test(name) && parseInt(name, 10) >= FIRST_AUTOMATIC)
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), 'utf8') }));
}

/**
 * Applies whichever migrations haven't run yet, and returns their names.
 * `query(sql, params)` must resolve to something with `rows` when given params.
 */
export async function runMigrations(query, migrations, log = console.log) {
  await query(TRACKING_TABLE);
  const applied = [];

  for (const { name, sql } of migrations) {
    const checksum = sha256(sql);
    await query('BEGIN');
    try {
      // Two builds at once take turns, and the second finds the work already done
      await query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
      // Give up quickly on a busy table, rather than queueing customers behind this
      await query(`SET LOCAL lock_timeout = '10s'`);

      const { rows } = await query('SELECT checksum FROM public.schema_migrations WHERE name = $1', [name]);
      if (rows.length > 0) {
        if (rows[0].checksum !== checksum) log(`Warning: ${name} changed after it ran. Put changes in a new file; this one won't run again.`);
        await query('COMMIT');
        continue;
      }

      log(`Applying ${name}`);
      await query(sql);
      await query('INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
      await query('COMMIT');
      applied.push(name);
    } catch (err) {
      await query('ROLLBACK').catch(() => {});
      throw new Error(`${name} failed and was rolled back: ${err.message}`);
    }
  }
  return applied;
}

/** Whether this build may touch the database, and why not if it may not. */
export function migrationDecision(env) {
  if (env.VERCEL_ENV !== 'production') return { run: false, why: 'this is not a production deployment' };
  if (!env.SUPABASE_DB_URL) return { run: false, why: 'SUPABASE_DB_URL is not set, so new migrations must be run by hand (supabase/README.md)' };
  return { run: true };
}

/**
 * The database password crosses this connection, so the server's certificate is
 * always checked. Supabase signs with its own authority, whose certificate comes
 * from SUPABASE_DB_CA. Only a database on this machine goes unencrypted.
 */
export function connectionConfig(raw, ca) {
  const url = new URL(raw);
  // A copied address may say sslmode=..., which would override the settings below
  url.searchParams.delete('sslmode');
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  const verified = ca ? { ca: ca.replace(/\\n/g, '\n') } : true;
  return { connectionString: url.toString(), ssl: local ? false : verified, connectionTimeoutMillis: 15_000 };
}

async function main() {
  const decision = migrationDecision(process.env);
  if (!decision.run) {
    console.log(`Database migrations skipped: ${decision.why}.`);
    return;
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client(connectionConfig(process.env.SUPABASE_DB_URL, process.env.SUPABASE_DB_CA));
  await client.connect();
  try {
    const applied = await runMigrations((sql, params) => client.query(sql, params), readMigrations());
    console.log(applied.length > 0 ? `Database migrations applied: ${applied.join(', ')}.` : 'Database already up to date.');
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    const hint = /certificate/i.test(err.message) ? '\nSet SUPABASE_DB_CA to Supabase\'s certificate. See supabase/README.md.' : '';
    console.error(`Database migration failed, so this deploy stops here and the live site stays as it is.\n${err.message}${hint}`);
    process.exit(1);
  });
}
