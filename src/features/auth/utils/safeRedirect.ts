// Open-redirect guard for ?redirect= / ?next= params. Used by the login page
// (browser) and the /auth/callback route (server), so it must stay free of
// client- or server-only imports.

// A same-site path starts with exactly one '/'. '//evil.com' and '/\evil.com'
// are protocol-relative URLs to another host in every browser.
function isSingleSlashPath(path: string): boolean {
  return path.startsWith('/') && path[1] !== '/' && path[1] !== '\\';
}

/**
 * Returns `raw` as a normalized same-origin path (pathname + search + hash),
 * or `fallback` if it is missing, absolute, protocol-relative, or resolves to
 * a different origin.
 *
 * @param origin the current origin, e.g. window.location.origin or
 *               new URL(req.url).origin
 */
export function safeRedirectPath(
  raw: string | null | undefined,
  origin: string,
  fallback = '/'
): string {
  if (!raw || !isSingleSlashPath(raw)) return fallback;

  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return fallback;

    // Re-check after normalization: the URL parser strips tabs/newlines and
    // resolves dot segments, so e.g. '/.//evil.com' comes out as '//evil.com'.
    const path = url.pathname + url.search + url.hash;
    return isSingleSlashPath(path) ? path : fallback;
  } catch {
    return fallback;
  }
}
