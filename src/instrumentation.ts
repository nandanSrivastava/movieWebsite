import * as Sentry from '@sentry/nextjs';

// Standard @sentry/nextjs instrumentation: load the per-runtime config files.
// (The SDK also auto-loads these; importing here is the documented pattern and
// avoids double-initializing Sentry with duplicate init() calls.)
// Browser-side init lives in src/instrumentation-client.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
    warnIfMockModeInProduction();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// Reports errors thrown in Server Components, route handlers, server actions
// and proxy to Sentry (no-op when no DSN is configured).
export const onRequestError = Sentry.captureRequestError;

// NEXT_PUBLIC_APP_ENV=development switches db.ts to the in-memory mock
// database. In a production build that means real bookings go nowhere, so
// shout about it — but don't throw: taking the whole site down is worse.
function warnIfMockModeInProduction() {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_ENV === 'development') {
    const message =
      '[startup] NEXT_PUBLIC_APP_ENV=development in a PRODUCTION build — the app is running on the ' +
      'in-memory MOCK database. Bookings and payments will not be persisted. ' +
      'Remove NEXT_PUBLIC_APP_ENV from the production environment and redeploy.';
    console.error('\n' + '!'.repeat(80) + '\n' + message + '\n' + '!'.repeat(80) + '\n');
    Sentry.captureMessage(message, 'fatal');
  }
}
