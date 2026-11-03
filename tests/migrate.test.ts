// The script that runs new migrations during a production deploy, on a real (in-process) Postgres.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { connectionConfig, migrationDecision, readMigrations, runMigrations } from '../scripts/migrate.mjs';

let db: PGlite;
const query = (sql: string, params?: unknown[]) => (params ? db.query(sql, params) : db.exec(sql)) as Promise<any>;
const tables = async () => (await db.query<{ tablename: string }>(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map(r => r.tablename);
const recorded = async () => (await db.query<{ name: string }>(`select name from schema_migrations order by name`)).rows.map(r => r.name);
const quiet = () => {};

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;`);
});
afterEach(() => db.close());

describe('running migrations', () => {
  const first = { name: '007_a.sql', sql: 'CREATE TABLE a (id int); CREATE TABLE a2 (id int);' };
  const second = { name: '008_b.sql', sql: 'CREATE TABLE b (id int);' };

  it('applies new files in order and records them', async () => {
    expect(await runMigrations(query, [first, second], quiet)).toEqual(['007_a.sql', '008_b.sql']);
    expect(await tables()).toEqual(['a', 'a2', 'b', 'schema_migrations']);
    expect(await recorded()).toEqual(['007_a.sql', '008_b.sql']);
  });

  it('does nothing the second time, so a redeploy is harmless', async () => {
    await runMigrations(query, [first], quiet);
    await db.exec('INSERT INTO a VALUES (1)');
    expect(await runMigrations(query, [first], quiet)).toEqual([]);
    expect((await db.query(`select * from a`)).rows).toHaveLength(1);
  });

  it('only runs what was added since the last deploy', async () => {
    await runMigrations(query, [first], quiet);
    expect(await runMigrations(query, [first, second], quiet)).toEqual(['008_b.sql']);
  });

  it('undoes all of a file that fails, stops there, and names it', async () => {
    const broken = { name: '008_broken.sql', sql: 'CREATE TABLE half_done (id int); SELECT * FROM does_not_exist;' };
    const later = { name: '009_later.sql', sql: 'CREATE TABLE later (id int);' };
    await expect(runMigrations(query, [first, broken, later], quiet)).rejects.toThrow(/008_broken\.sql failed and was rolled back/);
    expect(await tables()).toEqual(['a', 'a2', 'schema_migrations']);
    expect(await recorded()).toEqual(['007_a.sql']);
  });

  it('runs a failed file again on the next deploy, once it is fixed', async () => {
    await expect(runMigrations(query, [{ name: '007_a.sql', sql: 'nonsense' }], quiet)).rejects.toThrow();
    expect(await runMigrations(query, [first], quiet)).toEqual(['007_a.sql']);
  });

  it('warns about a file edited after it ran, and leaves it alone', async () => {
    await runMigrations(query, [first], quiet);
    const said: string[] = [];
    expect(await runMigrations(query, [{ ...first, sql: 'DROP TABLE a;' }], (line: string) => said.push(line))).toEqual([]);
    expect(said.join()).toMatch(/007_a\.sql changed after it ran/);
    expect(await tables()).toContain('a');
  });

  it('keeps its own records away from the public key', async () => {
    await runMigrations(query, [first], quiet);
    await db.exec('SET ROLE anon');
    await expect(db.query('select * from schema_migrations')).rejects.toThrow(/permission denied/);
    await db.exec('RESET ROLE');
  });
});

describe('which files it takes care of', () => {
  it('starts at 006: the earlier ones were run by hand', () => {
    const names = readMigrations().map((m: { name: string }) => m.name);
    expect(names[0]).toBe('006_payment_and_hold_fixes.sql');
    expect(names.every((name: string) => parseInt(name, 10) >= 6)).toBe(true);
  });
});

describe('when it may touch the database', () => {
  const url = 'postgres://u:p@aws-0-x.pooler.supabase.com:5432/postgres';

  it('only on Vercel\'s production build with the address set', () => {
    expect(migrationDecision({ VERCEL_ENV: 'production', SUPABASE_DB_URL: url }).run).toBe(true);
    expect(migrationDecision({ VERCEL_ENV: 'production' }).run).toBe(false);
    expect(migrationDecision({ VERCEL_ENV: 'preview', SUPABASE_DB_URL: url }).run).toBe(false);
    expect(migrationDecision({ VERCEL_ENV: 'development', SUPABASE_DB_URL: url }).run).toBe(false);
    expect(migrationDecision({ SUPABASE_DB_URL: url }).run).toBe(false);
  });

  it('checks Supabase\'s certificate against the one supplied, whatever the copied address says', () => {
    const config = connectionConfig(`${url}?sslmode=disable`, 'THE CERTIFICATE');
    expect(config.connectionString).not.toContain('sslmode');
    expect(config.ssl).toEqual({ ca: 'THE CERTIFICATE' });
  });

  it('still insists on a checked connection with no certificate supplied', () => {
    expect(connectionConfig(url).ssl).toBe(true);
  });

  it('accepts a certificate pasted with its line breaks written as \\n', () => {
    expect(connectionConfig(url, 'line one\\nline two').ssl).toEqual({ ca: 'line one\nline two' });
  });

  it('only skips encryption for a database on this machine', () => {
    expect(connectionConfig('postgres://postgres@127.0.0.1:5432/postgres').ssl).toBe(false);
    expect(connectionConfig('postgres://postgres@localhost:5432/postgres').ssl).toBe(false);
  });

  it('keeps the password usable when it has special characters', () => {
    expect(connectionConfig('postgres://u:p%40ss@h.example:5432/postgres').connectionString).toContain('p%40ss');
  });
});
