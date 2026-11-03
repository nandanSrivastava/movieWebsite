import { describe, it, expect } from 'vitest';
import { isSessionCookieName } from '../src/lib/sessionCookie';

describe('which cookies mean someone is signed in', () => {
  it('knows a session, whole or split', () => {
    expect(isSessionCookieName('sb-abc123-auth-token')).toBe(true);
    expect(isSessionCookieName('sb-abc123-auth-token.0')).toBe(true);
    expect(isSessionCookieName('sb-abc123-auth-token.1')).toBe(true);
  });

  it('isn\'t fooled by a sign-in still in progress, or by other cookies', () => {
    expect(isSessionCookieName('sb-abc123-auth-token-code-verifier')).toBe(false);
    expect(isSessionCookieName('sb-active-session')).toBe(false);
    expect(isSessionCookieName('dt_guest')).toBe(false);
    expect(isSessionCookieName('')).toBe(false);
  });
});
