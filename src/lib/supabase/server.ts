/**
 * Supabase server client (Server Components, Server Actions, Route Handlers).
 * Cookies-aware via next/headers.
 *
 * Le `setAll` peut throw quand appele depuis un Server Component pur — c'est
 * silencieux car le proxy refresh la session sur chaque request.
 *
 * Doc : https://supabase.com/docs/guides/auth/server-side/nextjs
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Ignore : appele depuis un Server Component (read-only).
            // Le proxy se charge du refresh des cookies.
          }
        },
      },
    },
  );
}
