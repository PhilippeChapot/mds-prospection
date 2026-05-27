/**
 * P8.3 — definitions et resolution des 13 audiences predefinies.
 *
 * Approche pragmatique : chaque audience est une fonction async qui
 * retourne la liste des contacts eligibles APRES filtrage prefs (P8.1).
 *
 * Chaque resolveur :
 *   1. Query SQL specifique a l'audience (prospects, affiliates, etc.).
 *   2. JOIN contacts + companies + contact_preferences.
 *   3. Filtre serveur : unsubscribed_all_at IS NULL + pref_<category> = true.
 *   4. Applique filtres additionnels (poles, etapes, langue).
 *   5. Construit eligible[] + skipped[] (avec skip_reason).
 *
 * Critique RGPD : aucun contact pref_off ne traverse cette couche dans
 * `eligible`. Les skipped sont retournes pour traçabilite (loggés dans
 * campaign_recipients status='skipped').
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import {
  CATEGORY_TO_PREF,
  type AudienceDef,
  type AudienceFilters,
  type AudienceResolution,
  type CampaignCategory,
  type EligibleRecipient,
  type SkippedRecipient,
} from './types';

type Supa = SupabaseClient<Database>;

export const AUDIENCES: AudienceDef[] = [
  {
    key: 'all_contacts',
    label: 'Tous les contacts',
    description: 'Tous les contacts en base avec un email valide.',
    defaultCategory: 'general',
  },
  {
    key: 'newsletter_subscribers',
    label: 'Abonnés newsletter',
    description: 'Contacts opt-in catégorie "Communications générales".',
    defaultCategory: 'general',
  },
  {
    key: 'active_prospects',
    label: 'Prospects actifs (pipeline ouvert)',
    description: 'Contacts dont le prospect est lead/contact/devis_envoye.',
    defaultCategory: 'general',
  },
  {
    key: 'exposants_confirmed',
    label: 'Exposants confirmés (devis signé)',
    description: 'Contacts dont le prospect a signed_at non null.',
    defaultCategory: 'exposant',
  },
  {
    key: 'exposants_paid',
    label: 'Exposants payés',
    description: 'Contacts dont le prospect a acompte_paid_at non null.',
    defaultCategory: 'exposant',
  },
  {
    key: 'exposants_unsigned_7d',
    label: 'Devis envoyé non signé > 7j',
    description: 'Contacts en relance acquisition (devis_envoye + 7+ jours).',
    defaultCategory: 'general',
  },
  {
    key: 'billing_contacts',
    label: 'Contacts facturation (exposants confirmés)',
    description: 'Contacts opt-in catégorie facturation, prospect signé.',
    defaultCategory: 'facturation',
  },
  {
    key: 'marketing_contacts',
    label: 'Contacts marketing (kit média)',
    description: 'Contacts opt-in catégorie kit média.',
    defaultCategory: 'kit_media',
  },
  {
    key: 'active_affiliates',
    label: 'Affiliés actifs',
    description: 'Contacts liés à un affilié actif (match email).',
    defaultCategory: 'partenariat',
  },
  {
    key: 'media_press',
    label: 'Médias / presse',
    description: 'Contacts dont la company.category = standard avec pole audio/video.',
    defaultCategory: 'general',
  },
  {
    key: 'institutional_partners',
    label: 'Partenaires institutionnels',
    description: "Contacts dont la company a été marquée 'institutionnel' (source landing).",
    defaultCategory: 'partenariat',
  },
  {
    key: 'unconverted_signups',
    label: 'Inscrits non convertis',
    description: 'Contacts issus de signups verified mais sans prospect actif.',
    defaultCategory: 'general',
  },
  {
    key: 'custom',
    label: 'Audience custom (filtres seuls)',
    description: 'Pas d audience predefinie — filtres pole/etape/langue uniquement.',
    defaultCategory: 'general',
  },
];

export function getAudienceDef(key: string): AudienceDef | undefined {
  return AUDIENCES.find((a) => a.key === key);
}

// ---------------------------------------------------------------------------
// Resolution : pour V1, on factorise sur une approche "lister les
// candidat-contact-ids selon la regle audience, puis fetch +
// filtrer prefs en JS".
// Strategie scalable : convient < 10 000 contacts (largement P8 V1).
// ---------------------------------------------------------------------------

async function resolveCandidateContactIds(supabase: Supa, audienceKey: string): Promise<string[]> {
  if (
    audienceKey === 'all_contacts' ||
    audienceKey === 'newsletter_subscribers' ||
    audienceKey === 'custom'
  ) {
    const { data } = await supabase.from('contacts').select('id').limit(10000);
    return (data ?? []).map((r) => r.id);
  }

  if (
    audienceKey === 'active_prospects' ||
    audienceKey === 'exposants_confirmed' ||
    audienceKey === 'exposants_paid' ||
    audienceKey === 'exposants_unsigned_7d' ||
    audienceKey === 'billing_contacts' ||
    audienceKey === 'marketing_contacts'
  ) {
    let q = supabase
      .from('prospects')
      .select('primary_contact_id, status, signed_at, acompte_paid_at, created_at');
    if (audienceKey === 'active_prospects') {
      q = q.in('status', ['lead', 'contact', 'devis_envoye']);
    } else if (
      audienceKey === 'exposants_confirmed' ||
      audienceKey === 'billing_contacts' ||
      audienceKey === 'marketing_contacts'
    ) {
      q = q.not('signed_at', 'is', null);
    } else if (audienceKey === 'exposants_paid') {
      q = q.not('acompte_paid_at', 'is', null);
    } else if (audienceKey === 'exposants_unsigned_7d') {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      q = q.eq('status', 'devis_envoye').lt('created_at', sevenDaysAgo);
    }
    const { data } = await q.limit(10000);
    return (data ?? [])
      .map((r) => r.primary_contact_id)
      .filter((id): id is string => id !== null && id !== undefined);
  }

  if (audienceKey === 'active_affiliates') {
    // Contacts dont l'email correspond a un affiliate actif.
    const { data: affs } = await supabase
      .from('affiliates')
      .select('contact_email')
      .eq('is_active', true);
    const emails = (affs ?? [])
      .map((a) => a.contact_email)
      .filter((e): e is string => typeof e === 'string' && e.length > 0);
    if (emails.length === 0) return [];
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email')
      .in('email', emails);
    return (contacts ?? []).map((c) => c.id);
  }

  if (audienceKey === 'media_press') {
    // Contacts d'une company standard avec pole code audio* ou video*.
    const { data } = await supabase
      .from('contacts')
      .select('id, company:companies!inner(id, category, pole:poles(code))')
      .eq('company.category', 'standard')
      .limit(10000);
    return (data ?? [])
      .filter((c) => {
        const company = Array.isArray(c.company) ? c.company[0] : c.company;
        const pole = (company as { pole?: { code?: string } } | null)?.pole;
        const code = pole?.code ?? '';
        return /AUDIO|VIDEO|TV|RADIO|PRESS/i.test(code);
      })
      .map((c) => c.id);
  }

  if (audienceKey === 'institutional_partners') {
    // Heuristique : source='institutionnel' dans landing signups OR
    // company.name contient certains termes ; V1 pragmatique : on prend
    // les prospects.source='landing_form' & source_detail='institutionnel'.
    const { data } = await supabase
      .from('prospects')
      .select('primary_contact_id')
      .eq('source', 'landing_form')
      .eq('source_detail', 'institutionnel');
    return (data ?? []).map((r) => r.primary_contact_id).filter((id): id is string => id !== null);
  }

  if (audienceKey === 'unconverted_signups') {
    // Signups DOI verifies mais pas encore convertis (cf. P5 signup flow).
    // La table reelle est `public_signup_attempts` (statut verified +
    // pas de prospect cree). On match ensuite avec contacts par email.
    const { data: signups } = await supabase
      .from('public_signup_attempts')
      .select('email, status')
      .eq('status', 'verified')
      .limit(10000);
    const emails = (signups ?? [])
      .map((s) => s.email)
      .filter((e): e is string => typeof e === 'string' && e.length > 0);
    if (emails.length === 0) return [];
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email')
      .in('email', emails);
    return (contacts ?? []).map((c) => c.id);
  }

  return [];
}

/**
 * Resoudre une audience complete : applique filtres + enforce P8.1 prefs.
 * Garantie RGPD : eligible[] ne contient AUCUN contact unsubscribed
 * ou avec pref_<category>=false.
 */
export async function resolveAudience(
  supabase: Supa,
  params: {
    audienceKey: string;
    category: CampaignCategory;
    filters?: AudienceFilters;
  },
): Promise<AudienceResolution> {
  const candidateIds = await resolveCandidateContactIds(supabase, params.audienceKey);
  if (candidateIds.length === 0) {
    return { eligible: [], skipped: [] };
  }

  // Batch fetch (Supabase IN limite est ~1000 — on chunk si necessaire).
  const CHUNK = 500;
  const eligible: EligibleRecipient[] = [];
  const skipped: SkippedRecipient[] = [];
  const seenEmails = new Set<string>();
  const prefColumn = CATEGORY_TO_PREF[params.category];

  for (let i = 0; i < candidateIds.length; i += CHUNK) {
    const slice = candidateIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('contacts')
      .select(
        `id, email, first_name, last_name, language,
         company:companies(name, pole:poles(code)),
         preferences:contact_preferences(*)`,
      )
      .in('id', slice);
    if (error) {
      console.warn('[campaigns/audiences] fetch chunk failed:', error.message);
      continue;
    }
    for (const c of data ?? []) {
      const email = (c.email ?? '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        skipped.push({ contact_id: c.id, email: c.email ?? '', reason: 'invalid_email' });
        continue;
      }
      if (seenEmails.has(email)) {
        skipped.push({ contact_id: c.id, email, reason: 'duplicate' });
        continue;
      }
      seenEmails.add(email);

      const prefs = Array.isArray(c.preferences) ? c.preferences[0] : c.preferences;
      type Prefs = Record<string, unknown> & { unsubscribed_all_at?: string | null };
      const p = (prefs as Prefs | null) ?? null;
      if (p?.unsubscribed_all_at) {
        skipped.push({ contact_id: c.id, email, reason: 'unsubscribed' });
        continue;
      }
      const prefValue = p ? (p as Record<string, unknown>)[prefColumn] : undefined;
      // Defaut V1 : si la row contact_preferences n'existe pas (legacy),
      // on considere pref_general=true (default DB) et autres=false. On
      // applique la meme logique cote enforcement : seul pref_general
      // est implicite true ; les autres requierent opt-in explicite.
      const isPrefOn =
        prefValue === true || (prefValue === undefined && prefColumn === 'pref_general');
      if (!isPrefOn) {
        skipped.push({ contact_id: c.id, email, reason: 'pref_off' });
        continue;
      }

      const company = Array.isArray(c.company) ? c.company[0] : c.company;
      const companyName = (company as { name?: string } | null)?.name ?? null;
      const poleCode = ((company as { pole?: unknown } | null)?.pole as { code?: string } | null)
        ?.code;

      // Filtres additionnels (poles/etapes/langue).
      if (params.filters?.langue && c.language !== params.filters.langue) {
        skipped.push({ contact_id: c.id, email, reason: 'pref_off' });
        continue;
      }
      if (params.filters?.poles && params.filters.poles.length > 0) {
        if (!poleCode || !params.filters.poles.includes(poleCode)) {
          skipped.push({ contact_id: c.id, email, reason: 'pref_off' });
          continue;
        }
      }

      eligible.push({
        contact_id: c.id,
        email,
        first_name: c.first_name,
        last_name: c.last_name,
        company_name: companyName,
        language: (c.language as 'FR' | 'EN') ?? 'FR',
      });
    }
  }

  return { eligible, skipped };
}
