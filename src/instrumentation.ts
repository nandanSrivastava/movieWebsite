// Standard @sentry/nextjs instrumentation: load the per-runtime config files.
// (The SDK also auto-loads these; importing here is the documented pattern and
// avoids double-initializing Sentry with duplicate init() calls.)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}
