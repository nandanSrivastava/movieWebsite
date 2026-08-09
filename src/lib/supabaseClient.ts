import { createClient } from '@supabase/supabase-js';

// Singleton browser-side Supabase client.
// Used by AuthContext only — server-side DB calls go through db.ts.
const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);
