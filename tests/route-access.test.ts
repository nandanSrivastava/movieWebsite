// Who may call what, and what they get back. Everything that sells tickets, admits
// people or changes the schedule has a guard here.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
// Runs after() work straight away, so tests can see what it did
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), after: (work: () => unknown) => work() }));

const auth = vi.hoisted(() => ({ user: null as null | { id: string; role: 'admin' | 'member' | 'user' } }));

const db = vi.hoisted(() => {
  const names = [
    'getBookingById', 'checkInBooking', 'undoCheckIn', 'logAudit', 'getAllMovies', 'getMovieById', 'createMovie', 'updateMovie',
    'getShowById', 'cancelShow', 'createShow', 'getShows', 'getShowOccupancy', 'getShowsForScreen', 'getProfile', 'getMembers',
    'updateProfileRole', 'onboardMember', 'getBookingsForShowDate', 'forceReleaseSeatHolds', 'releaseSeatHolds', 'createPendingBooking',
    'findHolderTickets', 'searchPaidBookings', 'getBookingByQrToken', 'getPaidBookingsForShowDate', 'getRefundPendingBookings',
    'getUnsentRefundEmailBookings', 'lockSeats', 'getSeatHolds', 'getSalesSummary', 'getAuditLogs', 'getActiveLocks',
  ];
  return { isMock: true, ...Object.fromEntries(names.map(name => [name, vi.fn()])) } as Record<string, any>;
});

const payments = vi.hoisted(() => ({ processRefund: vi.fn() }));

vi.mock('@/lib/db', () => ({ db, isMockMode: true }));
vi.mock('@/lib/rateLimit', () => ({ rateLimit: async () => null }));
vi.mock('@/lib/mailer', () => ({ queueTicketEmail: vi.fn(), queueRefundEmail: vi.fn(), sendExtraPaymentRefundEmail: vi.fn(), deliverRefundEmail: vi.fn(), sendTicketLookupEmails: vi.fn() }));
vi.mock('@/lib/payments', () => ({ processRefund: payments.processRefund, checkEarlierAttempt: vi.fn(), getRazorpay: vi.fn(), isRazorpayConfigured: () => false, newQrToken: () => 'tkt_x', toPaise: (n: number) => n * 100 }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/requestAuth', () => ({
  getRequestUser: async () => auth.user,
  getStaffUser: async () => (auth.user && ['admin', 'member'].includes(auth.user.role) ? auth.user : null),
  getHoldOwner: async () => ({ owner: auth.user?.id ?? 'guest-1', user: auth.user, newGuestId: null }),
  getClientIp: () => '1.2.3.4',
  setGuestCookie: () => {},
  readGuestId: () => 'guest-1',
}));

import * as showsRoute from '../src/app/api/shows/route';
import * as moviesRoute from '../src/app/api/admin/movies/route';
import * as membersRoute from '../src/app/api/admin/members/route';
import * as adminBookingsRoute from '../src/app/api/admin/bookings/route';
import * as statsRoute from '../src/app/api/admin/stats/route';
import * as auditRoute from '../src/app/api/admin/audit-logs/route';
import * as locksRoute from '../src/app/api/admin/active-locks/route';
import * as unlockRoute from '../src/app/api/seats/unlock/route';
import * as checkInRoute from '../src/app/api/bookings/check-in/route';
import * as verifyRoute from '../src/app/api/bookings/verify/route';
import * as counterRoute from '../src/app/api/counter/bookings/route';
import * as createOrderRoute from '../src/app/api/checkout/create-order/route';
import * as statusRoute from '../src/app/api/bookings/status/route';
import { showStartsAt } from '../src/lib/istDate';

const MOVIE = 'd798a3b8-6c84-4828-98e3-50ebbc2a1d21';
const SCREEN = 'a9f1a0e7-3f36-41b2-bb5b-43a0e698889c';
const BOOKING = '11111111-1111-1111-1111-111111111111';

const ADMIN = { id: 'admin-1', role: 'admin' as const };
const STAFF = { id: 'staff-1', role: 'member' as const };
const CUSTOMER = { id: 'customer-1', role: 'user' as const };

const request = (method: string, path: string, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });

const future = (hoursFromNow: number) => {
  const d = new Date(Date.now() + 5.5 * 3_600_000 + hoursFromNow * 3_600_000).toISOString();
  return { show_date: d.slice(0, 10), show_time: d.slice(11, 19) };
};

const paidTicket = (overrides: Record<string, unknown> = {}) => ({
  id: BOOKING,
  payment_status: 'paid',
  access_key: 'secret-key',
  hold_owner: 'someone',
  booked_by: 'someone',
  booking_seats: [],
  show: { ...future(0.25), movie: { title: 'Film' } },
  ...overrides,
});

const newShow = { movie_id: MOVIE, screen_id: SCREEN, show_date: future(48).show_date, show_time: '18:00' };

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  db.logAudit.mockResolvedValue(undefined);
  db.getShowsForScreen.mockResolvedValue([]);
  db.getMovieById.mockResolvedValue({ id: MOVIE, title: 'Film', is_active: true, duration_minutes: 120 });
  db.createShow.mockResolvedValue({ id: 'new-show' });
  db.getShows.mockResolvedValue([]);
  db.getShowOccupancy.mockResolvedValue({});
  db.getRefundPendingBookings.mockResolvedValue([]);
  db.getUnsentRefundEmailBookings.mockResolvedValue([]);
});

describe('owner-only routes', () => {
  const routes: [string, () => Promise<Response>][] = [
    ['schedule a show', () => showsRoute.POST(request('POST', '/api/shows', newShow))],
    ['cancel a show', () => showsRoute.DELETE(request('DELETE', '/api/shows?id=x'))],
    ['list all movies', () => moviesRoute.GET(request('GET', '/api/admin/movies'))],
    ['add a movie', () => moviesRoute.POST(request('POST', '/api/admin/movies', { title: 'x' }))],
    ['edit a movie', () => moviesRoute.PATCH(request('PATCH', '/api/admin/movies', { id: MOVIE, is_active: false }))],
    ['list staff', () => membersRoute.GET(request('GET', '/api/admin/members'))],
    ['create staff', () => membersRoute.POST(request('POST', '/api/admin/members', { full_name: 'x', email: 'x@y.in', password: 'long-enough-1' }))],
    ['remove staff', () => membersRoute.DELETE(request('DELETE', '/api/admin/members?id=x'))],
    ['see all bookings', () => adminBookingsRoute.GET(request('GET', '/api/admin/bookings'))],
    ['see sales', () => statsRoute.GET(request('GET', '/api/admin/stats'))],
    ['see the audit log', () => auditRoute.GET(request('GET', '/api/admin/audit-logs'))],
    ['see who holds seats', () => locksRoute.GET(request('GET', '/api/admin/active-locks'))],
    ['force-release seats', () => unlockRoute.POST(request('POST', '/api/seats/unlock', { showId: 's', seatLayoutIds: ['a'], force: true }))],
  ];

  describe.each([['a guest', null], ['a customer', CUSTOMER], ['counter staff', STAFF]])('%s', (_who, user) => {
    it.each(routes)('cannot %s', async (_name, call) => {
      auth.user = user;
      const res = await call();
      expect(res.status).toBe(403);
      for (const write of [db.createShow, db.cancelShow, db.createMovie, db.updateMovie, db.updateProfileRole, db.onboardMember, db.forceReleaseSeatHolds]) {
        expect(write).not.toHaveBeenCalled();
      }
    });
  });
});

describe('staff-only routes', () => {
  const routes: [string, () => Promise<Response>][] = [
    ['admit a ticket', () => checkInRoute.POST(request('POST', '/api/bookings/check-in', { bookingId: BOOKING }))],
    ['undo an entry', () => checkInRoute.DELETE(request('DELETE', '/api/bookings/check-in', { bookingId: BOOKING }))],
    ['search tickets', () => verifyRoute.GET(request('GET', '/api/bookings/verify?token=9876543210'))],
    ['list today\'s tickets', () => counterRoute.GET(request('GET', '/api/counter/bookings'))],
  ];

  describe.each([['a guest', null], ['a customer', CUSTOMER]])('%s', (_who, user) => {
    it.each(routes)('cannot %s', async (_name, call) => {
      auth.user = user;
      expect((await call()).status).toBe(403);
      expect(db.checkInBooking).not.toHaveBeenCalled();
      expect(db.undoCheckIn).not.toHaveBeenCalled();
    });
  });
});

describe('cash sales', () => {
  const sale = { showId: 'show', seatLayoutIds: ['a'], customerName: 'Asha', customerPhone: '9876543210', idempotencyKey: '11111111-1111-4111-8111-111111111111', paymentMethod: 'cash' };

  it.each([['a guest', null], ['a customer', CUSTOMER]])('%s can\'t issue a free ticket', async (_who, user) => {
    auth.user = user;
    const res = await createOrderRoute.POST(request('POST', '/api/checkout/create-order', sale));
    expect(res.status).toBe(403);
    expect(db.createPendingBooking).not.toHaveBeenCalled();
  });
});

describe('checkout details', () => {
  const order = { showId: 'show', seatLayoutIds: ['a'], customerName: 'Asha', customerPhone: '9876543210', idempotencyKey: '11111111-1111-4111-8111-111111111111' };

  it.each([
    ['an 11-digit typo', { customerPhone: '98765432101' }, /mobile/i],
    ['a name of invisible characters', { customerName: '​‍' }, /name/i],
    ['a NUL byte in the name', { customerName: 'As\u0000ha' }, /name/i],
    ['a malformed email', { customerEmail: 'a@b' }, /email/i],
  ])('refuses %s with a message about that field', async (_what, change, message) => {
    const res = await createOrderRoute.POST(request('POST', '/api/checkout/create-order', { ...order, ...change }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(message);
    expect(db.createPendingBooking).not.toHaveBeenCalled();
  });

  it('stores the subscriber number, however it was pasted', async () => {
    db.createPendingBooking.mockResolvedValue({ status: 'invalid', booking: null });
    await createOrderRoute.POST(request('POST', '/api/checkout/create-order', { ...order, customerPhone: '+91 98765 43210' }));
    expect(db.createPendingBooking).toHaveBeenCalledWith(expect.objectContaining({ phone: '9876543210' }));
  });
});

describe('the gate', () => {
  beforeEach(() => { auth.user = STAFF; db.checkInBooking.mockResolvedValue(1); });
  const admit = () => checkInRoute.POST(request('POST', '/api/bookings/check-in', { bookingId: BOOKING }));

  it('admits a paid ticket during its entry window, without handing out its secret key', async () => {
    db.getBookingById.mockResolvedValue(paidTicket());
    const res = await admit();
    expect(res.status).toBe(200);
    expect(db.checkInBooking).toHaveBeenCalledWith(BOOKING, STAFF.id, undefined);
    const body = await res.json();
    expect(body.booking.access_key).toBeUndefined();
    expect(body.booking.hold_owner).toBeUndefined();
  });

  it.each(['pending', 'failed', 'refund_pending', 'refunded'])('refuses a %s ticket', async (payment_status) => {
    db.getBookingById.mockResolvedValue(paidTicket({ payment_status }));
    expect((await admit()).status).toBe(400);
    expect(db.checkInBooking).not.toHaveBeenCalled();
  });

  it('refuses a ticket too early, and one for a show that has ended', async () => {
    db.getBookingById.mockResolvedValue(paidTicket({ show: future(4) }));
    expect((await admit()).status).toBe(400);
    db.getBookingById.mockResolvedValue(paidTicket({ show: future(-5) }));
    expect((await admit()).status).toBe(400);
    expect(db.checkInBooking).not.toHaveBeenCalled();
  });

  it('won\'t admit the same ticket twice', async () => {
    db.getBookingById.mockResolvedValue(paidTicket());
    db.checkInBooking.mockResolvedValue(0);
    expect((await admit()).status).toBe(409);
  });

  it('can admit part of a family now and the rest later', async () => {
    db.getBookingById.mockResolvedValue(paidTicket());
    db.checkInBooking.mockResolvedValue(1);
    const res = await checkInRoute.POST(request('POST', '/api/bookings/check-in', { bookingId: BOOKING, count: 1 }));
    expect(res.status).toBe(200);
    expect(db.checkInBooking).toHaveBeenCalledWith(BOOKING, STAFF.id, 1);
    expect((await res.json()).admitted).toBe(1);
  });

  it.each([[0], [-1], [11], [1.5], ['2']])('refuses a head count of %s', async (count) => {
    db.getBookingById.mockResolvedValue(paidTicket());
    expect((await checkInRoute.POST(request('POST', '/api/bookings/check-in', { bookingId: BOOKING, count }))).status).toBe(400);
    expect(db.checkInBooking).not.toHaveBeenCalled();
  });

  it('can undo a mistaken entry, and leaves a record of who did', async () => {
    db.getBookingById.mockResolvedValue(paidTicket());
    db.undoCheckIn.mockResolvedValue(true);
    const res = await checkInRoute.DELETE(request('DELETE', '/api/bookings/check-in', { bookingId: BOOKING }));
    expect(res.status).toBe(200);
    expect(db.logAudit).toHaveBeenCalledWith(STAFF.id, 'TICKET_CHECK_IN_UNDONE', { bookingId: BOOKING });
  });

  it('finds a ticket from a pasted link, without its secret key', async () => {
    db.getBookingById.mockResolvedValue(paidTicket());
    const link = encodeURIComponent(`https://www.dhrubcineplex.in/booking/confirmation/${BOOKING}?k=secret-key`);
    const res = await verifyRoute.GET(request('GET', `/api/bookings/verify?token=${link}`));
    expect(db.getBookingById).toHaveBeenCalledWith(BOOKING);
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.booking.access_key).toBeUndefined();
  });

  it('says when a search found more than it shows', async () => {
    db.getBookingById.mockResolvedValue(null);
    db.searchPaidBookings.mockResolvedValue(Array.from({ length: 26 }, (_, i) => paidTicket({ id: String(i) })));
    const body = await (await verifyRoute.GET(request('GET', '/api/bookings/verify?token=9876'))).json();
    expect(body.matches).toHaveLength(25);
    expect(body.hasMore).toBe(true);
    expect(body.matches[0].access_key).toBeUndefined();
  });
});

describe('reading a ticket', () => {
  const read = (key = '') => statusRoute.GET(request('GET', `/api/bookings/status?bookingId=${BOOKING}${key ? `&k=${key}` : ''}`));

  it('takes the secret link key or the right account', async () => {
    db.getBookingById.mockResolvedValue(paidTicket());
    expect((await read('secret-key')).status).toBe(200);
    auth.user = { id: 'someone', role: 'user' };
    expect((await read()).status).toBe(200);
  });

  it('looks exactly like "no such ticket" to anyone else', async () => {
    db.getBookingById.mockResolvedValue(paidTicket());
    const stranger = await read('wrong-key');
    auth.user = CUSTOMER;
    const otherCustomer = await read();
    expect(stranger.status).toBe(404);
    expect(otherCustomer.status).toBe(404);
  });

  it('never shows who holds the booking', async () => {
    db.getBookingById.mockResolvedValue(paidTicket());
    const body = await (await read('secret-key')).json();
    expect(body.hold_owner).toBeUndefined();
  });
});

describe('scheduling', () => {
  beforeEach(() => { auth.user = ADMIN; });
  const schedule = (body: unknown) => showsRoute.POST(request('POST', '/api/shows', body));

  it('schedules a free slot', async () => {
    const res = await schedule(newShow);
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
  });

  it('refuses a film that doesn\'t exist, or is hidden', async () => {
    db.getMovieById.mockResolvedValue(null);
    expect((await schedule(newShow)).status).toBe(400);
    db.getMovieById.mockResolvedValue({ id: MOVIE, title: 'Film', is_active: false });
    expect((await schedule(newShow)).status).toBe(400);
    expect(db.createShow).not.toHaveBeenCalled();
  });

  it('calls it a failure when nothing could be scheduled', async () => {
    db.getShowsForScreen.mockResolvedValue([{ show_date: newShow.show_date, show_time: '18:00:00', movie: { title: 'Other', duration_minutes: 120 } }]);
    const res = await schedule(newShow);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Clashes with Other/);
    expect(db.createShow).not.toHaveBeenCalled();
  });

  it('won\'t put two overlapping slots from one request on the same screen', async () => {
    const res = await schedule({ movie_id: MOVIE, screen_id: SCREEN, dates: [newShow.show_date], times: ['18:00', '19:00'] });
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.skipped).toHaveLength(1);
  });

  it('skips only the slots already gone when scheduling from today', async () => {
    const today = future(0).show_date;
    const res = await schedule({ movie_id: MOVIE, screen_id: SCREEN, dates: [today, newShow.show_date], times: ['00:00'] });
    expect((await res.json()).count).toBe(1);
    expect(showStartsAt(today, '00:00').getTime()).toBeLessThan(Date.now());
  });

  it('refuses a slot in the past, bad prices and impossible dates', async () => {
    expect((await schedule({ ...newShow, show_date: '2020-01-01' })).status).toBe(400);
    expect((await schedule({ ...newShow, price_classic: 0 })).status).toBe(400);
    expect((await schedule({ ...newShow, show_date: '2026-02-30' })).status).toBe(400);
  });
});

describe('cancelling a show', () => {
  beforeEach(() => { auth.user = ADMIN; db.getShowById.mockResolvedValue({ id: 'show', movie_id: MOVIE }); });

  it('starts the refunds, and reports what happens to the people who bought it', async () => {
    db.cancelShow.mockResolvedValue({ status: 'cancelled', onlineRefunds: 2, cashRefunds: 1 });
    db.getRefundPendingBookings.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);
    const res = await showsRoute.DELETE(request('DELETE', '/api/shows?id=show'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ removed: false, onlineRefunds: 2, cashRefunds: 1 });
    expect(payments.processRefund.mock.calls.map(c => c[0])).toEqual(['b1', 'b2']);
    expect(db.logAudit).toHaveBeenCalledWith(ADMIN.id, 'SHOW_CANCELLED', expect.objectContaining({ showId: 'show' }));
  });

  it('starts no refunds for a show nobody bought', async () => {
    db.cancelShow.mockResolvedValue({ status: 'deleted', onlineRefunds: 0, cashRefunds: 0 });
    const body = await (await showsRoute.DELETE(request('DELETE', '/api/shows?id=show'))).json();
    expect(body.removed).toBe(true);
    expect(payments.processRefund).not.toHaveBeenCalled();
  });

  it('refuses a show that has already played, so nobody who watched it is refunded', async () => {
    db.cancelShow.mockResolvedValue({ status: 'already_started', onlineRefunds: 0, cashRefunds: 0 });
    const res = await showsRoute.DELETE(request('DELETE', '/api/shows?id=show'));
    expect(res.status).toBe(409);
    expect(payments.processRefund).not.toHaveBeenCalled();
    expect(db.logAudit).not.toHaveBeenCalledWith(ADMIN.id, 'SHOW_CANCELLED', expect.anything());
  });

  it('says so when the show is already gone', async () => {
    db.cancelShow.mockResolvedValue({ status: 'not_found', onlineRefunds: 0, cashRefunds: 0 });
    expect((await showsRoute.DELETE(request('DELETE', '/api/shows?id=show'))).status).toBe(404);
  });
});

describe('movies', () => {
  beforeEach(() => { auth.user = ADMIN; db.updateMovie.mockResolvedValue({ id: MOVIE }); db.createMovie.mockResolvedValue({ id: MOVIE }); });

  it('adds a film without needing the featured column unless it is used', async () => {
    await moviesRoute.POST(request('POST', '/api/admin/movies', { title: 'New Film' }));
    expect(db.createMovie.mock.calls[0][0]).not.toHaveProperty('is_featured');
    await moviesRoute.POST(request('POST', '/api/admin/movies', { title: 'New Film', is_featured: true }));
    expect(db.createMovie.mock.calls[1][0].is_featured).toBe(true);
  });

  it('lists hidden films too, so they can be brought back', async () => {
    db.getAllMovies.mockResolvedValue([{ id: MOVIE, is_active: false }]);
    expect((await (await moviesRoute.GET(request('GET', '/api/admin/movies'))).json()).movies).toHaveLength(1);
  });

  it('changes only what was sent', async () => {
    await moviesRoute.PATCH(request('PATCH', '/api/admin/movies', { id: MOVIE, is_active: false }));
    expect(db.updateMovie).toHaveBeenCalledWith(MOVIE, { is_active: false });
  });

  it('refuses a link that isn\'t https, on add and on edit', async () => {
    expect((await moviesRoute.PATCH(request('PATCH', '/api/admin/movies', { id: MOVIE, poster_url: 'javascript:alert(1)' }))).status).toBe(400);
    expect((await moviesRoute.POST(request('POST', '/api/admin/movies', { title: 'x', trailer_url: 'http://x.in' }))).status).toBe(400);
    expect(db.updateMovie).not.toHaveBeenCalled();
  });
});

describe('staff accounts', () => {
  beforeEach(() => { auth.user = ADMIN; });
  const remove = () => membersRoute.DELETE(request('DELETE', '/api/admin/members?id=person'));

  it('removing staff turns them back into a customer, on the record', async () => {
    db.getProfile.mockResolvedValue({ id: 'person', role: 'member', full_name: 'Ravi' });
    expect((await remove()).status).toBe(200);
    expect(db.updateProfileRole).toHaveBeenCalledWith('person', 'user');
    expect(db.logAudit).toHaveBeenCalledWith(ADMIN.id, 'MEMBER_REMOVED', expect.anything(), expect.anything());
  });

  it('can\'t be used to demote an administrator, or anyone who isn\'t staff', async () => {
    for (const role of ['admin', 'user']) {
      db.getProfile.mockResolvedValue({ id: 'person', role });
      expect((await remove()).status).toBe(409);
    }
    expect(db.updateProfileRole).not.toHaveBeenCalled();
  });
});
