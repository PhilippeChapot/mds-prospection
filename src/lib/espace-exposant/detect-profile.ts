/**
 * P8.2 — helper detectUserProfile.
 *
 * Pour un contactId donne, calcule les flags qui pilotent le menu
 * dynamique du dashboard espace contact. Resultat consomme par le
 * layout dashboard pour filtrer les nav-items + adapter le titre.
 *
 * Source de verite :
 *   - is_exposant   : prospect actif status IN ('signe', 'acompte_paye',
 *                     'paye_integral') OU signed_at non-null.
 *   - is_lead       : prospect status IN ('lead', 'contact', 'devis_envoye').
 *   - is_affiliate  : presence d'une row affiliates avec contact_email
 *                     correspondant (le lien affiliate-contact passe par
 *                     email faute de FK directe).
 *   - has_stand     : prospect avec booth_assignment non-null OU
 *                     selected_booth_id.
 *   - is_partner    : V2 (company_profiles publies — pas implem V1).
 *
 * Best-effort : si une query echoue, le flag est false. Le contact peut
 * toujours acceder a profil + prefs.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export interface ContactProfile {
  contact_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  language: 'FR' | 'EN';
  company_id: string | null;
  company_name: string | null;
  /** Flags pour menu dynamique. */
  is_exposant: boolean;
  is_lead: boolean;
  is_affiliate: boolean;
  is_partner: boolean;
  has_stand: boolean;
  /** Si exposant : le prospect actif principal (pour les pages dashboard/stand/etc.). */
  active_prospect_id: string | null;
}

const LOG_PREFIX = '[espace-exposant/detect-profile]';

const EXPO_STATUSES = new Set<string>(['signe']);
const LEAD_STATUSES = new Set<string>(['lead', 'contact', 'devis_envoye']);

export async function detectUserProfile(contactId: string): Promise<ContactProfile | null> {
  if (!contactId) return null;
  const supabase = getSupabaseServiceClient();

  // 1. Charger le contact + sa company.
  const { data: contact, error } = await supabase
    .from('contacts')
    .select(
      `id, email, first_name, last_name, language, company_id,
       company:companies(name)`,
    )
    .eq('id', contactId)
    .maybeSingle();
  if (error || !contact) {
    console.warn('%s contact-not-found id=%s msg=%s', LOG_PREFIX, contactId, error?.message);
    return null;
  }

  const company = Array.isArray(contact.company)
    ? contact.company[0]
    : (contact.company as { name?: string } | null);

  // 2. Prospects lies (via primary_contact_id).
  let isExpo = false;
  let isLead = false;
  let hasStand = false;
  let activeProspectId: string | null = null;
  try {
    const { data: prospects } = await supabase
      .from('prospects')
      .select('id, status, signed_at, booth_assignment, selected_booth_id')
      .eq('primary_contact_id', contactId)
      .order('last_activity_at', { ascending: false });
    for (const p of prospects ?? []) {
      if (p.signed_at || EXPO_STATUSES.has(p.status)) {
        isExpo = true;
        if (!activeProspectId) activeProspectId = p.id;
        if (p.booth_assignment || p.selected_booth_id) hasStand = true;
      } else if (LEAD_STATUSES.has(p.status)) {
        isLead = true;
        if (!activeProspectId) activeProspectId = p.id;
      }
    }
  } catch (err) {
    console.warn(
      '%s prospects-query-failed contact=%s msg=%s',
      LOG_PREFIX,
      contactId,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 3. Affilie (match par email contact).
  let isAffiliate = false;
  try {
    const { data: aff } = await supabase
      .from('affiliates')
      .select('id, is_active')
      .ilike('contact_email', contact.email)
      .eq('is_active', true)
      .limit(1);
    isAffiliate = Boolean(aff && aff.length > 0);
  } catch (err) {
    console.warn(
      '%s affiliate-query-failed contact=%s msg=%s',
      LOG_PREFIX,
      contactId,
      err instanceof Error ? err.message : String(err),
    );
  }

  return {
    contact_id: contact.id,
    email: contact.email,
    first_name: contact.first_name,
    last_name: contact.last_name,
    language: (contact.language as 'FR' | 'EN') ?? 'FR',
    company_id: contact.company_id,
    company_name: company?.name ?? null,
    is_exposant: isExpo,
    is_lead: isLead,
    is_affiliate: isAffiliate,
    is_partner: false, // V2
    has_stand: hasStand,
    active_prospect_id: activeProspectId,
  };
}
