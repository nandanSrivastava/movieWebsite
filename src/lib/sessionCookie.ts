// Supabase keeps a signed-in session in cookies named sb-<project>-auth-token,
// split into .0, .1 when long. Used by the proxy and the browser alike.
export const isSessionCookieName = (name: string) =>
  name.startsWith('sb-') && name.includes('-auth-token') && !name.endsWith('-code-verifier');

/** Browser only: is anyone signed in here? Answers without loading Supabase's library. */
export const browserHasSession = () =>
  document.cookie.split(';').some(cookie => isSessionCookieName(cookie.split('=')[0].trim()));
