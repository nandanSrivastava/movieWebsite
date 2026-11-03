import { isMockMode } from '@/lib/config';
import { browserHasSession } from '@/lib/sessionCookie';

/** The signed-in customer's token for an API call. Empty for guests. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (isMockMode || !browserHasSession()) return {};
  const { supabase } = await import('@/lib/supabaseClient');
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}
