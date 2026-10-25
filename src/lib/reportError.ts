// Browser error reporting without putting Sentry (~110 KB gzipped) in every
// page's initial JavaScript: the SDK is fetched only when there's a DSN and
// an error actually needs reporting.
export function reportError(error: unknown, context?: Parameters<typeof import('@sentry/nextjs').captureException>[1]) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  import('@sentry/nextjs')
    .then((Sentry) => Sentry.captureException(error, context))
    .catch(() => {});
}
