/**
 * P11.x.MultiPartnerContentResolution — résolution du prospect actif pour
 * l'espace partenaire PAR COMPANY (via partner_access_grants), et non plus
 * par prospect.primary_contact_id.
 *
 * Contexte : P11.x.MultiPartnerAccess a migré l'AUTH vers
 * `partner_access_grants` (1 company → N contacts), mais la résolution du
 * CONTENU filtrait encore par primary_contact_id → un contact secondaire
 * (ex: Sophie, non primary) se connectait mais ne voyait aucune section.
 *
 * Règle :
 *   1. Grant actif du contact → company_id ; on prend le prospect de cette
 *      company pour la saison active, statut "visible partenaire", le plus
 *      récent. Le grant company PRIME (un secondaire voit le dossier de la
 *      société comme le contact principal).
 *   2. Pas de grant (contact legacy sans grant) → fallback historique sur
 *      primary_contact_id (rétro-compat, zéro breaking change).
 *
 * Pas de 'use server' : helper pur (client injecté) → testable sans
 * cookies/JWT. Le client est le service client (RLS bypass : le partenaire
 * n'est pas un user DB authentifié).
 */

import { type SupabaseClient } from '@supabase/supabase-js';

/**
 * Statuts donnant accès au contenu de l'espace partenaire. Décision Phil :
 * périmètre permissif `devis_envoye+` (le partenaire voit son dossier dès
 * le devis envoyé, pas seulement après signature) — évite les sections
 * mortes. Exclut lead / contact / perdu.
 */
export const PARTNER_VISIBLE_PROSPECT_STATUSES = [
  'devis_envoye',
  'signe',
  'acompte_paye',
  'paye_integral',
] as const;

/**
 * Résout l'id du prospect actif à afficher pour un contact donné.
 * Retourne null si aucun dossier visible (→ empty state géré en amont).
 */
export async function resolveActiveProspectIdForContact(
  supabase: SupabaseClient,
  contactId: string,
): Promise<string | null> {
  // 1. Grant actif → company_id (index unique : au plus 1 grant actif).
  const { data: grant } = await supabase
    .from('partner_access_grants')
    .select('company_id')
    .eq('contact_id', contactId)
    .is('revoked_at', null)
    .maybeSingle();

  if (grant?.company_id) {
    // Le grant company prime : on NE retombe PAS sur primary_contact_id.
    return findCompanyActiveProspectId(supabase, grant.company_id as string);
  }

  // 2. Fallback legacy : contact sans grant → prospect dont il est le
  //    primary_contact (rétro-compat pré-P11.x).
  const { data: byPrimary } = await supabase
    .from('prospects')
    .select('id')
    .eq('primary_contact_id', contactId)
    .in('status', [...PARTNER_VISIBLE_PROSPECT_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (byPrimary?.id as string | undefined) ?? null;
}

export interface PartnerGrant {
  company_id: string;
  role: string;
}

/** Grant actif (non révoqué) d'un contact, ou null. */
export async function getActiveGrantForContact(
  supabase: SupabaseClient,
  contactId: string,
): Promise<PartnerGrant | null> {
  const { data } = await supabase
    .from('partner_access_grants')
    .select('company_id, role')
    .eq('contact_id', contactId)
    .is('revoked_at', null)
    .maybeSingle();
  if (!data?.company_id) return null;
  return { company_id: data.company_id as string, role: (data.role as string) ?? 'collaborator' };
}

/**
 * Droit d'écriture engageant la company (commande, logo, slug). `viewer`
 * = lecture seule. Les tokens legacy (kind='prospect', sans grant) sont
 * traités comme 'owner' (rétro-compat : le partenaire historique avait
 * tous les droits).
 */
export function canPlaceOrder(role: string | null): boolean {
  return role === 'owner' || role === 'collaborator';
}

export interface PartnerWriteContext {
  contactId: string | null;
  prospectId: string | null;
  /** owner | collaborator | viewer ; 'owner' pour les tokens legacy. */
  role: string | null;
}

/**
 * Résout le contexte d'écriture partenaire à partir des claims JWT déjà
 * vérifiés (pas de cookie ici → testable). Gère les deux kinds :
 *   - kind='contact' : sub = contact_id → grant (role + company) + prospect
 *     résolu par company.
 *   - kind='prospect' (legacy) : sub = prospect_id → role 'owner', contact =
 *     primary_contact du prospect.
 */
export async function resolvePartnerWriteContext(
  supabase: SupabaseClient,
  claims: { kind: 'prospect' | 'contact'; prospectId: string },
): Promise<PartnerWriteContext> {
  if (claims.kind === 'contact') {
    const contactId = claims.prospectId; // sub = contact_id
    const grant = await getActiveGrantForContact(supabase, contactId);
    const prospectId = await resolveActiveProspectIdForContact(supabase, contactId);
    return { contactId, prospectId, role: grant?.role ?? null };
  }
  // Legacy : sub = prospect_id, droits pleins.
  const { data } = await supabase
    .from('prospects')
    .select('primary_contact_id')
    .eq('id', claims.prospectId)
    .maybeSingle();
  return {
    contactId: (data?.primary_contact_id as string | null) ?? null,
    prospectId: claims.prospectId,
    role: 'owner',
  };
}

/** Prospect le plus récent d'une company pour la saison active. */
async function findCompanyActiveProspectId(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .maybeSingle();
  if (!season?.id) return null;

  const { data: prospect } = await supabase
    .from('prospects')
    .select('id')
    .eq('company_id', companyId)
    .eq('season_id', season.id as string)
    .in('status', [...PARTNER_VISIBLE_PROSPECT_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (prospect?.id as string | undefined) ?? null;
}
