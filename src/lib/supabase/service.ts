/**
 * Supabase service-role client.
 *
 * BYPASS RLS — a utiliser UNIQUEMENT cote server (route handlers, server
 * actions, scripts). Jamais exposer ce client cote client.
 *
 * Use cases P3 :
 *   - /api/public/companies/search : autocomplete societe avec SELECT id+name
 *     (RLS interdit l'anon de SELECT companies, mais on expose un sous-ensemble
 *     volontairement limite via cet endpoint).
 *   - /api/signup/init : INSERT public_signup_attempts + lookup anti-doublon
 *     sur contacts/prospects (anti-doublon doit voir tous les enregistrements,
 *     pas seulement ceux visibles au role anon).
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

let cached: ReturnType<typeof createServiceClient> | null = null;

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'createSupabaseServiceClient: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.',
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabaseServiceClient() {
  if (!cached) cached = createServiceClient();
  return cached;
}
