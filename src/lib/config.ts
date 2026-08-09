// Standalone config — safe to import in client components.
// Keeps db.ts off the client bundle.
export const isMockMode =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
