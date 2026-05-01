/**
 * Supabase browser client (Client Components, server actions cote client).
 * Lit la session depuis les cookies poses par le middleware/server.
 *
 * Doc : https://supabase.com/docs/guides/auth/server-side/creating-a-client
 */
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
