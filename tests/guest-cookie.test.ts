import { describe, it, expect, vi, beforeAll } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { GUEST_COOKIE, readGuestId, setGuestCookie } from '../src/lib/requestAuth';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const cookie = (value: string) => [{ name: GUEST_COOKIE, value }];

function issuedCookie(id: string) {
  const res = NextResponse.json({});
  setGuestCookie(res, id);
  return res.cookies.get(GUEST_COOKIE)!;
}

describe('guest cookie', () => {
  beforeAll(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-signing-key'; });

  it('reads back the id the server issued', () => {
    expect(readGuestId(cookie(issuedCookie(ID).value))).toBe(ID);
  });

  it('is out of reach of page scripts', () => {
    expect(issuedCookie(ID).httpOnly).toBe(true);
  });

  it('refuses an id written in by hand, which could be somebody\'s account id', () => {
    expect(readGuestId(cookie(ID))).toBeNull();
    expect(readGuestId(cookie(`${ID}.`))).toBeNull();
    expect(readGuestId(cookie(`${ID}.forged`))).toBeNull();
  });

  it('refuses one customer\'s signature on another customer\'s id', () => {
    const signature = issuedCookie(ID).value.split('.')[1];
    expect(readGuestId(cookie(`${OTHER}.${signature}`))).toBeNull();
  });

  it('refuses a signature made with another key', () => {
    const issued = issuedCookie(ID).value;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'a-different-key';
    expect(readGuestId(cookie(issued))).toBeNull();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-signing-key';
  });

  it('copes with junk and with no cookie', () => {
    expect(readGuestId([])).toBeNull();
    expect(readGuestId(cookie('not-a-uuid'))).toBeNull();
    expect(readGuestId(cookie('.'))).toBeNull();
    expect(readGuestId(cookie(`../../etc.${'x'.repeat(43)}`))).toBeNull();
  });
});
