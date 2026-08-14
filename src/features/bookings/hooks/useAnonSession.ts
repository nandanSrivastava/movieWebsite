'use client';

import { useState, useEffect } from 'react';

const ANON_SESSION_KEY = 'dhrub_anon_session_id';

/**
 * Generates or retrieves an ephemeral anonymous session ID from localStorage.
 * Used to identify unauthenticated users for seat locking — the ID is a plain
 * UUID so it's compatible with Supabase's uuid-typed `locked_by` column.
 *
 * The session persists across page refreshes (same browser) but is lost when
 * localStorage is cleared or in incognito mode across tabs.
 */
export function useAnonSession(): string {
  const [sessionId, setSessionId] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let stored = localStorage.getItem(ANON_SESSION_KEY);
    // Migrate old 'anon_' prefixed values to plain UUIDs
    if (stored && stored.startsWith('anon_')) {
      stored = stored.replace('anon_', '');
      localStorage.setItem(ANON_SESSION_KEY, stored);
    }
    if (!stored) {
      stored = crypto.randomUUID();
      localStorage.setItem(ANON_SESSION_KEY, stored);
    }
    setSessionId(stored);
  }, []);

  return sessionId;
}

/**
 * Non-hook version for use in event handlers / API calls.
 * Returns the current anonymous session ID synchronously.
 */
export function getAnonSessionId(): string {
  if (typeof window === 'undefined') return '';
  let stored = localStorage.getItem(ANON_SESSION_KEY);
  // Migrate old 'anon_' prefixed values to plain UUIDs
  if (stored && stored.startsWith('anon_')) {
    stored = stored.replace('anon_', '');
    localStorage.setItem(ANON_SESSION_KEY, stored);
  }
  if (!stored) {
    stored = crypto.randomUUID();
    localStorage.setItem(ANON_SESSION_KEY, stored);
  }
  return stored;
}
