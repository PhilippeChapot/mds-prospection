/**
 * P15.3 — helpers compte visiteur (visitor_accounts).
 *
 * Server-only (client service-role : visitor_accounts est RLS service_role).
 * Pas de 'use server' : importé par API routes + server actions.
 */
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type VisitorAuthLookup = {
  visitorId: string;
  contactId: string;
  email: string;
  firstName: string | null;
};

/**
 * Résout un visiteur depuis un email (via son contact). Renvoie null si
 * aucun contact OU aucun visiteur rattaché — anti-enumeration côté appelant.
 */
export async function findVisitorAuthByEmail(email: string): Promise<VisitorAuthLookup | null> {
  const supabase = getSupabaseServiceClient();

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, email, first_name')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();
  if (!contact) return null;

  const { data: visitor } = await supabase
    .from('visitors')
    .select('id')
    .eq('contact_id', contact.id)
    .maybeSingle();
  if (!visitor) return null;

  return {
    visitorId: visitor.id,
    contactId: contact.id,
    email: contact.email,
    firstName: contact.first_name,
  };
}

/**
 * Garantit qu'un visitor_account existe pour ce visiteur. Le crée (email =
 * email du contact) s'il manque. Renvoie l'id du compte.
 */
export async function ensureVisitorAccount(visitorId: string, email: string): Promise<string> {
  const supabase = getSupabaseServiceClient();

  const { data: existing } = await supabase
    .from('visitor_accounts')
    .select('id')
    .eq('visitor_id', visitorId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('visitor_accounts')
    .insert({ visitor_id: visitorId, email: email.toLowerCase() })
    .select('id')
    .single();
  if (error || !created) throw new Error(error?.message ?? 'Erreur création compte visiteur.');
  return created.id;
}

export type VisitorAccountByEmail = {
  id: string;
  visitor_id: string;
  password_hash: string | null;
};

export async function getVisitorAccountByEmail(
  email: string,
): Promise<VisitorAccountByEmail | null> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('visitor_accounts')
    .select('id, visitor_id, password_hash')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
