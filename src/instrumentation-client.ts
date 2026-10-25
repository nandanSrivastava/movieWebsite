// Browser-side Sentry setup. Next 16 builds with Turbopack, which never loads
// sentry.client.config.ts — this file is the only client entry point Sentry
// gets. https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// The SDK is ~110 KB gzipped (plus ~150 KB for session replay), so it loads
// after the page has, instead of delaying every visitor's first paint. Errors
// thrown before that are still reported by the error boundaries (reportError).

type SentryModule = typeof import('@sentry/nextjs');

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
let sentry: SentryModule | null = null;

// No DSN (local dev, previews) → Sentry stays completely off.
if (dsn && typeof window !== 'undefined') {
  const start = () => {
    import('@sentry/nextjs').then((Sentry) => {
      Sentry.init({
        dsn,
        // Sample 10% of page loads / navigations for performance traces.
        tracesSampleRate: 0.1,
        // No background session recordings — only keep a replay of the
        // moments leading up to an actual error.
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
        debug: false,
      });
      sentry = Sentry;
      Sentry.lazyLoadIntegration('replayIntegration')
        .then((replayIntegration) => Sentry.addIntegration(replayIntegration()))
        .catch(() => {});
    }).catch(() => {});
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

// Lets Sentry trace App Router navigations once it has loaded.
export function onRouterTransitionStart(...args: Parameters<SentryModule['captureRouterTransitionStart']>) {
  sentry?.captureRouterTransitionStart(...args);
}
