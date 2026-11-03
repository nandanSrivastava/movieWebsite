import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { db } from './db';

export interface RequestUser {
  id: string;
  role: 'admin' | 'member' | 'user';
}

export interface StaffUser {
  id: string | null;
  role: 'admin' | 'member';
}

type CookieList = { name: string; value: string }[];

const isSupabaseConfigured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * The mock login cookie is written by the browser, so it may only be trusted in
 * local development. A production build never trusts it, even if the Supabase
 * variables are missing: then nobody is signed in, instead of anyone being admin.
 */
export const isMockAuthAllowed = () => process.env.NODE_ENV !== 'production' && !isSupabaseConfigured();

/**
 * Resolves the signed-in user from request cookies (or a Bearer token).
 * Mock mode trusts the mock session cookie; live mode verifies the Supabase
 * session with Supabase and reads the role from the profiles table.
 */
export async function getUserFromCookies(cookieList: CookieList, bearer?: string | null): Promise<RequestUser | null> {
  if (!isSupabaseConfigured() && !isMockAuthAllowed()) {
    console.error('Supabase auth is not configured; treating every request as signed out.');
    return null;
  }
  if (isMockAuthAllowed()) {
    const mockSession = cookieList.find(c => c.name === 'cinebook_mock_session');
    if (!mockSession) return null;
    try {
      const sessionObj = JSON.parse(mockSession.value);
      if (!sessionObj?.id) return null;
      return { id: sessionObj.id, role: sessionObj.role || 'user' };
    } catch {
      return null;
    }
  }

  const { createServerClient } = await import('@supabase/ssr');
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieList;
        },
        setAll() {
          // Read-only: session refresh is handled by the page proxy
        },
      },
    }
  );

  // A refreshed session can't be saved from here (see setAll), so a bearer token
  // from the browser is preferred; otherwise the proxy has already refreshed the cookies.
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (!user) return null;

  const profile = await db.getProfile(user.id);
  return { id: user.id, role: profile?.role || 'user' };
}

/** The signed-in user behind an API request, or null for guests. */
export async function getRequestUser(req: NextRequest): Promise<RequestUser | null> {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || null;
  return getUserFromCookies(req.cookies.getAll(), bearer);
}

/** The caller, only if they are counter staff or an admin. */
export async function getStaffUser(req: NextRequest): Promise<StaffUser | null> {
  const user = await getRequestUser(req);
  if (!user || (user.role !== 'admin' && user.role !== 'member')) return null;
  return { id: user.id, role: user.role };
}

// ── Guest seat-hold identity ─────────────────────────────────
// Guests hold seats under a random id the server issues in an httpOnly cookie.
// The id is signed: hold owners and account ids share one namespace, so an
// unsigned cookie would let anyone write in somebody else's id and act as them.
export const GUEST_COOKIE = 'dt_guest';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const guestSignature = (guestId: string) =>
  createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-development')
    .update(`guest-cookie:${guestId}`)
    .digest('base64url');

export function readGuestId(cookieList: CookieList): string | null {
  const value = cookieList.find(c => c.name === GUEST_COOKIE)?.value;
  if (!value) return null;
  const [guestId, signature] = value.split('.');
  if (!signature || !UUID_RE.test(guestId)) return null;
  const given = Buffer.from(signature);
  const expected = Buffer.from(guestSignature(guestId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? guestId : null;
}

export function setGuestCookie(res: NextResponse, guestId: string) {
  res.cookies.set(GUEST_COOKIE, `${guestId}.${guestSignature(guestId)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Long enough for "tickets booked on this device" to outlast the show
    maxAge: 60 * 60 * 24 * 30,
  });
}

/**
 * Who a seat hold belongs to: the signed-in user, or the guest cookie.
 * `newGuestId` is set when a guest cookie must be issued on the response.
 */
export async function getHoldOwner(req: NextRequest, createIfMissing: boolean): Promise<{
  owner: string | null;
  user: RequestUser | null;
  newGuestId: string | null;
}> {
  // Written as one expression on purpose: Turbopack (Next 16) mis-evaluated an
  // early `if (user) return ...` here as always-true and dropped the guest path.
  const user: RequestUser | null = await getRequestUser(req);
  const cookieGuest = readGuestId(req.cookies.getAll());
  const guestId = user === null ? cookieGuest : null;
  const newGuestId = user === null && guestId === null && createIfMissing ? crypto.randomUUID() : null;
  if (user !== null && cookieGuest !== null) await adoptHolds(cookieGuest, user.id);

  return {
    owner: user !== null ? user.id : (guestId ?? newGuestId),
    user,
    newGuestId,
  };
}

/**
 * A guest who signs in mid-checkout keeps their seats. Called on every hold
 * lookup while a signed-in browser still has a guest cookie, and does nothing
 * once the holds have moved. Never blocks the request it runs in.
 */
async function adoptHolds(guestId: string, userId: string) {
  try {
    await db.adoptGuestHolds(guestId, userId);
  } catch (err) {
    console.error('Could not move guest holds to the account:', err);
  }
}

/**
 * Hold owner for a server component (seat map, checkout page). `owners` lists
 * every identity this browser has bought under: an account, and the guest
 * cookie from before signing in.
 */
export async function getHoldOwnerFromCookies(cookieList: CookieList): Promise<{ owner: string | null; owners: string[]; user: RequestUser | null }> {
  const user = await getUserFromCookies(cookieList);
  const guestId = readGuestId(cookieList);
  if (user && guestId) await adoptHolds(guestId, user.id);
  if (user) return { owner: user.id, owners: guestId ? [user.id, guestId] : [user.id], user };
  return { owner: guestId, owners: guestId ? [guestId] : [], user: null };
}

/**
 * Client network for rate limits and hold caps, as seen by Vercel's edge
 * (first X-Forwarded-For hop). IPv6 users get a whole /64 from their ISP and
 * can rotate addresses inside it freely, so a v6 address counts as its /64.
 */
export function getClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
  return ip ? networkKey(ip) : null;
}

export function networkKey(ip: string): string {
  const mappedV4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mappedV4) return mappedV4[1];
  if (!ip.includes(':')) return ip;

  // Expand "::" and keep the first four 16-bit groups (the /64 prefix)
  const [head, tail = ''] = ip.toLowerCase().split('%')[0].split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = ip.includes('::') && tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...headParts, ...Array(Math.max(0, 8 - headParts.length - tailParts.length)).fill('0'), ...tailParts]
    : headParts;
  return groups.slice(0, 4).map(g => (parseInt(g, 16) || 0).toString(16)).join(':') + '::/64';
}
