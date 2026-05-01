/**
 * Supabase browser client (Client Components, server actions cote client).
 * Lit la session depuis les cookies poses par le middleware/server.
 *
 * Doc : https://supabase.com/docs/guides/auth/server-side/creating-a-client
 */
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
