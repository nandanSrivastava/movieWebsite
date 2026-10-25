// Absolute base URL for links in emails and other places without a request.
// Set NEXT_PUBLIC_SITE_URL to the public domain; on Vercel the production
// domain is used automatically if it isn't set.
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

export function ticketUrl(bookingId: string, accessKey: string | undefined | null): string {
  const base = `${siteUrl()}/booking/confirmation/${bookingId}`;
  return accessKey ? `${base}?k=${encodeURIComponent(accessKey)}` : base;
}
