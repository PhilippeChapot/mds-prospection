'use server';

/**
 * P6.x.4-a-bis — server action createLeadFromLandingForm.
 *
 * Capté depuis la landing publique (modale Form Institutionnel/École),
 * crée :
 *   1. company (find-or-create dedupe par name + domain ; alternate_domains
 *      enrichis si la company existe avec un primary_domain différent)
 *   2. contact (find-or-create dedupe email ilike ; COALESCE des champs vides
 *      uniquement si existant — préserve le language existant en particulier)
 *   3. prospect (status='lead', source='landing_form', source_detail)
 *   4. Brevo : createOrUpdateContact avec attributs (FIRSTNAME/LASTNAME/COMPANY/
 *      PHONE/WEBSITE/LANGUAGE) puis ajout liste DEMANDES_TARIF_LANDING
 *   5. Email admin (avec lien vers /admin/prospects/[id])
 *   6. Email confirmation client
 *
 * P6.x.4-a-quater :
 *   - split first_name / last_name (vs full_name unifié en P6.x.4-a-bis)
 *   - language piloté par la locale URL via le composant client
 *   - propagation complète : website normalisé en domaine + Brevo attributes
 *     custom (helpers réutilisés depuis @/lib/utils/domain — P5.x.23-quater)
 */

import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendAdminNotification } from '@/lib/resend/admin-notifier';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import {
  renderAdminInstitutionnelEcoleRequest,
  renderClientInstitutionnelEcoleConfirmation,
  type RequestType,
} from '@/lib/resend/templates/institutionnel-ecole-request';
import { normalizeDomain, extractEmailDomain, isValidDomain } from '@/lib/utils/domain';

const LOG_PREFIX = '[landing/lead-action]';
const BREVO_API_BASE = 'https://api.brevo.com/v3';

const submitSchema = z.object({
  type: z.enum(['institutionnel', 'ecole']),
  org_name: z.string().trim().min(2).max(200),
  first_name: z.string().trim().min(2).max(120),
  last_name: z.string().trim().min(2).max(120),
  contact_email: z.string().trim().toLowerCase().email().max(180),
  contact_phone: z.string().trim().max(40).optional().or(z.literal('')),
  website: z.string().trim().max(300).optional().or(z.literal('')),
  message: z.string().trim().max(4000).optional().or(z.literal('')),
  language: z.enum(['FR', 'EN']).default('FR'),
});

export type LandingFormInput = z.infer<typeof submitSchema>;
export type LeadActionResult =
  | { ok: true; prospect_id: string; company_id: string; contact_id: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers (variantes publiques — sans requireAdminProfile)
// ---------------------------------------------------------------------------

interface CompanyMatch {
  id: string;
  name: string;
  primary_domain: string | null;
  alternate_domains: string[];
}

/**
 * Find or create company for landing.
 *
 * Stratégie de match :
 *   1. name_normalized exact (lowercased)
 *   2. primary_domain ou alternate_domains contient le candidate domain
 *
 * Si match name mais primary_domain différent du candidate (et candidate
 * pas déjà dans alternate_domains) → push dans alternate_domains
 * (cf. P5.x.23-quinquies).
 *
 * Création : primary_domain = candidate (website > email domain).
 */
export async function findOrCreateCompanyForLanding(params: {
  name: string;
  website: string | null;
  contactEmail: string;
}): Promise<CompanyMatch> {
  const supabase = getSupabaseServiceClient();
  const nameNormalized = params.name.toLowerCase().trim();

  // Candidate domain : website prioritaire (intention explicite), sinon email
  const websiteNormalized = params.website
    ? (() => {
        const n = normalizeDomain(params.website);
        return n && isValidDomain(n) ? n : null;
      })()
    : null;
  const emailDomain = extractEmailDomain(params.contactEmail);
  const candidateDomain = websiteNormalized || emailDomain;

  // 1. Match exact par name_normalized
  const { data: byName } = await supabase
    .from('companies')
    .select('id, name, primary_domain, alternate_domains')
    .eq('name_normalized', nameNormalized)
    .limit(1);
  if (byName && byName.length > 0) {
    const co = byName[0];
    const alt = (co.alternate_domains as string[] | null) ?? [];
    console.log('%s company-matched-by-name id=%s name=%s', LOG_PREFIX, co.id, co.name);
    // P6.x.4-a-quater : enrichir alternate_domains si nouveau domaine
    let nextAlt = alt;
    if (
      candidateDomain &&
      candidateDomain !== co.primary_domain &&
      !alt.includes(candidateDomain)
    ) {
      nextAlt = [...alt, candidateDomain];
      const { error: updErr } = await supabase
        .from('companies')
        .update({ alternate_domains: nextAlt })
        .eq('id', co.id);
      if (updErr) {
        console.warn(
          '%s alt-domain-update-failed id=%s domain=%s msg=%s',
          LOG_PREFIX,
          co.id,
          candidateDomain,
          updErr.message,
        );
      } else {
        console.log('%s alt-domain-added id=%s domain=%s', LOG_PREFIX, co.id, candidateDomain);
      }
    }
    return {
      id: co.id,
      name: co.name,
      primary_domain: co.primary_domain,
      alternate_domains: nextAlt,
    };
  }

  // 2. Si pas de match name, match par primary_domain ou alternate_domains
  if (candidateDomain) {
    const { data: byDomain } = await supabase
      .from('companies')
      .select('id, name, primary_domain, alternate_domains')
      .or(`primary_domain.eq.${candidateDomain},alternate_domains.cs.{${candidateDomain}}`)
      .limit(1);
    if (byDomain && byDomain.length > 0) {
      const co = byDomain[0];
      console.log(
        '%s company-matched-by-domain id=%s domain=%s',
        LOG_PREFIX,
        co.id,
        candidateDomain,
      );
      return {
        id: co.id,
        name: co.name,
        primary_domain: co.primary_domain,
        alternate_domains: (co.alternate_domains as string[] | null) ?? [],
      };
    }
  }

  // 3. Création
  const { data: created, error } = await supabase
    .from('companies')
    .insert({
      name: params.name,
      name_normalized: nameNormalized,
      primary_domain: candidateDomain,
      category: 'standard',
    })
    .select('id, name, primary_domain, alternate_domains')
    .single();
  if (error || !created) {
    throw new Error(`Insert company failed: ${error?.message ?? 'unknown'}`);
  }
  console.log(
    '%s company-created id=%s name=%s domain=%s',
    LOG_PREFIX,
    created.id,
    created.name,
    candidateDomain ?? '-',
  );
  return {
    id: created.id,
    name: created.name,
    primary_domain: created.primary_domain,
    alternate_domains: (created.alternate_domains as string[] | null) ?? [],
  };
}

interface ContactMatch {
  id: string;
  email: string;
  company_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  language: 'FR' | 'EN';
}

/**
 * Find or create contact dedupe par email case-insensitive.
 *
 * Si existant :
 *   - sur la MÊME company → COALESCE des champs vides uniquement (P5.x.23-ter
 *     doctrine : on n'écrase JAMAIS un champ déjà rempli, y compris language)
 *   - sur une AUTRE company → log warning, on garde le lien existant
 *     (pas de réassignation auto V1)
 */
export async function findOrCreateContactForLanding(params: {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  companyId: string;
  language: 'FR' | 'EN';
}): Promise<ContactMatch> {
  const supabase = getSupabaseServiceClient();
  const email = params.email.toLowerCase().trim();

  const { data: existing } = await supabase
    .from('contacts')
    .select('id, email, company_id, first_name, last_name, phone, language')
    .ilike('email', email)
    .limit(1);
  if (existing && existing.length > 0) {
    const c = existing[0] as ContactMatch;
    if (c.company_id !== params.companyId) {
      console.warn(
        '%s contact-exists-other-company contact=%s existing_company=%s new_company=%s — kept existing link',
        LOG_PREFIX,
        c.id,
        c.company_id,
        params.companyId,
      );
      return c;
    }
    // COALESCE : on n'écrase QUE les champs nuls/vides
    const patch: {
      first_name?: string;
      last_name?: string;
      phone?: string;
    } = {};
    if (!c.first_name && params.firstName) patch.first_name = params.firstName;
    if (!c.last_name && params.lastName) patch.last_name = params.lastName;
    if (!c.phone && params.phone) patch.phone = params.phone;
    // P6.x.4-a-quater : NE PAS écraser language si déjà set (preuve d'usage antérieur)
    if (Object.keys(patch).length > 0) {
      await supabase.from('contacts').update(patch).eq('id', c.id);
      console.log(
        '%s contact-enriched id=%s fields=%s',
        LOG_PREFIX,
        c.id,
        Object.keys(patch).join(','),
      );
      return { ...c, ...(patch as Partial<ContactMatch>) };
    }
    console.log('%s contact-matched-no-change id=%s', LOG_PREFIX, c.id);
    return c;
  }

  // Création
  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      company_id: params.companyId,
      email,
      first_name: params.firstName,
      last_name: params.lastName,
      phone: params.phone,
      language: params.language,
      is_primary: false, // V1 : pas écraser le primary existant
      email_deliverability_status: 'unknown',
      marketing_consent: true,
      lifecycle_emails_enabled: true,
    })
    .select('id, email, company_id, first_name, last_name, phone, language')
    .single();
  if (error || !created) {
    throw new Error(`Insert contact failed: ${error?.message ?? 'unknown'}`);
  }
  console.log(
    '%s contact-created id=%s email=%s language=%s',
    LOG_PREFIX,
    created.id,
    created.email,
    created.language,
  );
  return created as ContactMatch;
}

async function getActiveSeasonId(): Promise<string> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) throw new Error('No active season (seed 01_season manquant ?)');
  return data.id;
}

interface BrevoSyncParams {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  companyName: string;
  website: string | null;
  language: 'FR' | 'EN';
}

/**
 * P6.x.4-a-quater — sync Brevo avec attributs custom (FIRSTNAME, LASTNAME,
 * COMPANY, PHONE, WEBSITE, LANGUAGE) puis ajout à la liste
 * DEMANDES_TARIF_LANDING.
 *
 * Utilise createOrUpdateContact (POST /contacts upsert via updateEnabled=true)
 * pour garantir que les attributs sont posés à la création ET enrichis à l'update.
 *
 * Best-effort : si Brevo down, on log + skip (la row prospect reste valide).
 */
async function syncContactToBrevo(params: BrevoSyncParams): Promise<{ skipped: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  const listIdRaw = process.env.BREVO_LIST_ID_DEMANDES_TARIF_LANDING;
  if (!apiKey) {
    console.log('%s brevo-skip-no-api-key email=%s', LOG_PREFIX, params.email);
    return { skipped: true };
  }
  const listId = listIdRaw ? Number.parseInt(listIdRaw, 10) : NaN;
  const listIds = Number.isFinite(listId) ? [listId] : [];

  const attributes: Record<string, unknown> = {
    FIRSTNAME: params.firstName,
    LASTNAME: params.lastName,
    COMPANY: params.companyName,
    LANGUAGE: params.language,
  };
  if (params.phone) attributes.PHONE = params.phone;
  if (params.website) attributes.WEBSITE = params.website;

  try {
    // POST /contacts avec updateEnabled=true → upsert
    const res = await fetch(`${BREVO_API_BASE}/contacts`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        email: params.email,
        attributes,
        listIds,
        updateEnabled: true,
      }),
    });
    if (!res.ok && res.status !== 400) {
      // 400 = "Contact already exists" sur certains chemins anciens ; sur la
      // route /contacts avec updateEnabled=true c'est OK normalement.
      const body = await res.text().catch(() => '');
      console.warn('%s brevo-upsert http=%d body=%s', LOG_PREFIX, res.status, body.slice(0, 200));
    } else {
      console.log(
        '%s brevo-synced email=%s lists=%s',
        LOG_PREFIX,
        params.email,
        listIds.join(',') || '-',
      );
    }
  } catch (err) {
    console.warn(
      '%s brevo-sync-failed email=%s msg=%s',
      LOG_PREFIX,
      params.email,
      err instanceof Error ? err.message : String(err),
    );
  }
  return { skipped: false };
}

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

export async function createLeadFromLandingForm(
  input: LandingFormInput,
): Promise<LeadActionResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const data = parsed.data;
  const requestType: RequestType = data.type;

  try {
    // 1. Company
    const company = await findOrCreateCompanyForLanding({
      name: data.org_name,
      website: data.website || null,
      contactEmail: data.contact_email,
    });

    // 2. Contact (avec language depuis locale URL)
    const contact = await findOrCreateContactForLanding({
      email: data.contact_email,
      firstName: data.first_name,
      lastName: data.last_name,
      phone: data.contact_phone || null,
      companyId: company.id,
      language: data.language,
    });

    // 3. Prospect — création systématique (pas de dedupe au niveau prospect)
    const seasonId = await getActiveSeasonId();
    const supabase = getSupabaseServiceClient();
    const noteHeader = `[Demande tarif ${requestType} via landing]`;
    const notes = data.message ? `${noteHeader}\n\n${data.message}` : noteHeader;
    const { data: prospect, error: prospectErr } = await supabase
      .from('prospects')
      .insert({
        season_id: seasonId,
        company_id: company.id,
        primary_contact_id: contact.id,
        status: 'lead',
        source: 'landing_form',
        source_detail: requestType,
        notes,
        is_test: false,
      })
      .select('id')
      .single();
    if (prospectErr || !prospect) {
      console.error(
        '%s prospect-insert-failed msg=%s',
        LOG_PREFIX,
        prospectErr?.message ?? 'unknown',
      );
      return { ok: false, error: 'Impossible de créer le prospect, réessayez plus tard.' };
    }

    console.log(
      '%s prospect-created id=%s company=%s contact=%s type=%s lang=%s',
      LOG_PREFIX,
      prospect.id,
      company.id,
      contact.id,
      requestType,
      data.language,
    );

    // 4. Brevo upsert avec attributs custom + ajout liste (best-effort)
    await syncContactToBrevo({
      email: data.contact_email,
      firstName: data.first_name,
      lastName: data.last_name,
      phone: data.contact_phone || null,
      companyName: data.org_name,
      website: data.website || null,
      language: data.language,
    });

    // 5/6. Emails (best-effort)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
    const prospectUrl = `${appUrl}/admin/prospects/${prospect.id}`;
    try {
      const fullName = `${data.first_name} ${data.last_name}`.trim();
      const adminTpl = renderAdminInstitutionnelEcoleRequest({
        type: requestType,
        orgName: data.org_name,
        contactName: fullName,
        contactEmail: data.contact_email,
        contactPhone: data.contact_phone || null,
        website: data.website || null,
        message: data.message || null,
        requestId: prospect.id,
        adminUrl: prospectUrl,
        createdAt: new Date().toLocaleString('fr-FR'),
      });
      await sendAdminNotification('admin_institutionnel_ecole_request', adminTpl);
    } catch (err) {
      console.warn(
        '%s admin-email-failed prospect=%s msg=%s',
        LOG_PREFIX,
        prospect.id,
        err instanceof Error ? err.message : String(err),
      );
    }
    try {
      const clientTpl = renderClientInstitutionnelEcoleConfirmation({
        type: requestType,
        contactName: data.first_name,
        orgName: data.org_name,
      });
      await sendTransactionalEmailViaResend({
        to: data.contact_email,
        toName: `${data.first_name} ${data.last_name}`.trim(),
        subject: clientTpl.subject,
        html: clientTpl.html,
        text: clientTpl.text,
        tags: [{ name: 'category', value: 'landing_form_confirmation' }],
      });
    } catch (err) {
      console.warn(
        '%s client-email-failed prospect=%s msg=%s',
        LOG_PREFIX,
        prospect.id,
        err instanceof Error ? err.message : String(err),
      );
    }

    return {
      ok: true,
      prospect_id: prospect.id,
      company_id: company.id,
      contact_id: contact.id,
    };
  } catch (err) {
    console.error(
      '%s unexpected-error msg=%s',
      LOG_PREFIX,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, error: 'Erreur serveur, réessayez plus tard.' };
  }
}
