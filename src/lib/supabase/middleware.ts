/**
 * Supabase middleware client (Edge runtime, dans `src/proxy.ts`).
 *
 * `updateSession()` :
 *   1. Refresh la session si expiree (via auth.getUser()).
 *   2. Re-injecte les cookies dans la response pour que les Server Components
 *      voient une session a jour.
 *   3. Retourne `{ supabaseResponse, user }`.
 *
 * Doc : https://supabase.com/docs/guides/auth/server-side/nextjs#proxy
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';

export async function updateSession(
  request: NextRequest,
): Promise<{ supabaseResponse: NextResponse; user: User | null }> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // CRITICAL : ne RIEN faire entre createServerClient et getUser().
  // Sinon les cookies peuvent se desyncer (cf. doc Supabase).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user };
}
