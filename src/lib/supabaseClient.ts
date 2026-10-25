import { createBrowserClient } from '@supabase/ssr';

// Singleton browser-side Supabase client — server-side DB calls go through db.ts.
// It uses the PKCE flow and stores the session (and the PKCE code verifier) in
// cookies. Every auth call that sends an email (sign-up, password reset) must
// go through this client, never a plain supabase-js createClient(): that one
// defaults to the implicit flow, whose #access_token links /auth/callback
// can't read.
//
// In local mock mode (no Supabase env vars) the client is never used for real,
// but importing it must not throw, or every page with the header crashes.
const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-mode-placeholder-key';

export const supabase = createBrowserClient(supabaseUrl, supabaseKey);

