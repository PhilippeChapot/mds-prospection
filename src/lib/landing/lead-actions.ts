'use server';

/**
 * P6.x.4-a-bis — server action createLeadFromLandingForm.
 *
 * Capté depuis la landing publique (modale Form Institutionnel/École),
 * crée :
 *   1. company (find-or-create dedupe par name + domain)
 *   2. contact (find-or-create dedupe email ilike)
 *   3. prospect (status='lead', source='landing_form', source_detail)
 *   4. Brevo : ajout à liste DEMANDES_TARIF_LANDING (best-effort)
 *   5. Email admin (avec lien vers /admin/prospects/[id])
 *   6. Email confirmation client
 *
 * Remplace P6.x.4-a `submitInstitutionnelEcoleRequest` qui pointait
 * vers la table dédiée `institutionnel_ecole_requests` (droppée en 0043).
 *
 * Helpers dedupe inspirés du Smart Add Wizard (P5.x.23) mais variantes
 * publiques (pas de check requireAdminProfile, la landing est publique).
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

const LOG_PREFIX = '[landing/lead-action]';
const BREVO_API_BASE = 'https://api.brevo.com/v3';

const submitSchema = z.object({
  type: z.enum(['institutionnel', 'ecole']),
  org_name: z.string().trim().min(2).max(200),
  contact_name: z.string().trim().min(2).max(120),
  contact_email: z.string().trim().toLowerCase().email().max(180),
  contact_phone: z.string().trim().max(40).optional().or(z.literal('')),
  website: z.string().trim().max(300).optional().or(z.literal('')),
  message: z.string().trim().max(4000).optional().or(z.literal('')),
});

export type LandingFormInput = z.infer<typeof submitSchema>;
export type LeadActionResult =
  | { ok: true; prospect_id: string; company_id: string; contact_id: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers (variantes publiques — sans requireAdminProfile)
// ---------------------------------------------------------------------------

function extractEmailDomain(email: string): string | null {
  const at = email.indexOf('@');
  if (at < 0) return null;
  const domain = email
    .slice(at + 1)
    .toLowerCase()
    .trim();
  return domain || null;
}

interface CompanyMatch {
  id: string;
  name: string;
}

/**
 * Find or create company for landing : match strict par name (case-insensitive
 * normalisé) puis par domaine d'email si pas trouvé. Crée sinon avec
 * category='standard' (à harmoniser plus tard avec enum étendu).
 */
export async function findOrCreateCompanyForLanding(params: {
  name: string;
  website: string | null;
  contactEmail: string;
}): Promise<CompanyMatch> {
  const supabase = getSupabaseServiceClient();
  const nameNormalized = params.name.toLowerCase().trim();

  // 1. Match exact par name_normalized
  const { data: byName } = await supabase
    .from('companies')
    .select('id, name')
    .eq('name_normalized', nameNormalized)
    .limit(1);
  if (byName && byName.length > 0) {
    console.log(
      '%s company-matched-by-name id=%s name=%s',
      LOG_PREFIX,
      byName[0].id,
      byName[0].name,
    );
    return { id: byName[0].id, name: byName[0].name };
  }

  // 2. Si website ou domaine email fourni, match par primary_domain
  const emailDomain = extractEmailDomain(params.contactEmail);
  const websiteDomain = params.website
    ? params.website
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .toLowerCase()
        .trim()
    : null;
  const candidateDomain = websiteDomain || emailDomain;
  if (candidateDomain) {
    const { data: byDomain } = await supabase
      .from('companies')
      .select('id, name')
      .or(`primary_domain.eq.${candidateDomain},alternate_domains.cs.{${candidateDomain}}`)
      .limit(1);
    if (byDomain && byDomain.length > 0) {
      console.log(
        '%s company-matched-by-domain id=%s domain=%s',
        LOG_PREFIX,
        byDomain[0].id,
        candidateDomain,
      );
      return { id: byDomain[0].id, name: byDomain[0].name };
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
    .select('id, name')
    .single();
  if (error || !created) {
    throw new Error(`Insert company failed: ${error?.message ?? 'unknown'}`);
  }
  console.log('%s company-created id=%s name=%s', LOG_PREFIX, created.id, created.name);
  return { id: created.id, name: created.name };
}

interface ContactMatch {
  id: string;
  email: string;
  company_id: string;
}

/**
 * Find or create contact dedupe par email case-insensitive. Si déjà existant
 * sur une AUTRE société, log warning + on garde le lien existant (cf. doctrine
 * P5.x.23-ter). On ne réassigne pas automatiquement.
 */
export async function findOrCreateContactForLanding(params: {
  email: string;
  fullName: string;
  phone: string | null;
  companyId: string;
}): Promise<ContactMatch> {
  const supabase = getSupabaseServiceClient();
  const email = params.email.toLowerCase().trim();

  const { data: existing } = await supabase
    .from('contacts')
    .select('id, email, company_id')
    .ilike('email', email)
    .limit(1);
  if (existing && existing.length > 0) {
    const c = existing[0];
    if (c.company_id !== params.companyId) {
      console.warn(
        '%s contact-exists-other-company contact=%s existing_company=%s new_company=%s — kept existing link',
        LOG_PREFIX,
        c.id,
        c.company_id,
        params.companyId,
      );
    } else {
      console.log('%s contact-matched id=%s email=%s', LOG_PREFIX, c.id, c.email);
    }
    return { id: c.id, email: c.email, company_id: c.company_id };
  }

  // Split full name : naïf (premier mot → first_name, reste → last_name)
  const parts = params.fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      company_id: params.companyId,
      email,
      first_name: firstName,
      last_name: lastName,
      phone: params.phone,
      language: 'FR',
      is_primary: false, // V1 : pas écraser le primary existant
      email_deliverability_status: 'unknown',
      marketing_consent: true,
      lifecycle_emails_enabled: true,
    })
    .select('id, email, company_id')
    .single();
  if (error || !created) {
    throw new Error(`Insert contact failed: ${error?.message ?? 'unknown'}`);
  }
  console.log('%s contact-created id=%s email=%s', LOG_PREFIX, created.id, created.email);
  return { id: created.id, email: created.email, company_id: created.company_id };
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

async function addContactToLandingBrevoList(email: string): Promise<{ skipped: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  const listIdRaw = process.env.BREVO_LIST_ID_DEMANDES_TARIF_LANDING;
  if (!apiKey || !listIdRaw) {
    console.log('%s brevo-skip-no-config email=%s', LOG_PREFIX, email);
    return { skipped: true };
  }
  const listId = Number.parseInt(listIdRaw, 10);
  if (!Number.isFinite(listId)) return { skipped: true };
  try {
    const res = await fetch(`${BREVO_API_BASE}/contacts/lists/${listId}/contacts/add`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ emails: [email] }),
    });
    if (!res.ok && res.status !== 400) {
      // 400 = "Contact already in list" usually
      const body = await res.text().catch(() => '');
      console.warn('%s brevo-list-add http=%d body=%s', LOG_PREFIX, res.status, body.slice(0, 200));
    } else {
      console.log('%s brevo-added email=%s list=%d', LOG_PREFIX, email, listId);
    }
  } catch (err) {
    console.warn(
      '%s brevo-add-failed email=%s msg=%s',
      LOG_PREFIX,
      email,
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
    // 1. Company find-or-create
    const company = await findOrCreateCompanyForLanding({
      name: data.org_name,
      website: data.website || null,
      contactEmail: data.contact_email,
    });

    // 2. Contact find-or-create
    const contact = await findOrCreateContactForLanding({
      email: data.contact_email,
      fullName: data.contact_name,
      phone: data.contact_phone || null,
      companyId: company.id,
    });

    // 3. Prospect INSERT — on ne dédupe PAS au niveau prospect (chaque demande
    //    crée son ticket dans le pipeline), même si la société est déjà en pipe.
    //    Phil voit deux lignes s'il y a deux demandes : c'est l'historique.
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
      return {
        ok: false,
        error: 'Impossible de créer le prospect, réessayez plus tard.',
      };
    }

    console.log(
      '%s prospect-created id=%s company=%s contact=%s type=%s',
      LOG_PREFIX,
      prospect.id,
      company.id,
      contact.id,
      requestType,
    );

    // 4. Brevo (best-effort)
    await addContactToLandingBrevoList(data.contact_email);

    // 5/6. Emails (best-effort)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
    const prospectUrl = `${appUrl}/admin/prospects/${prospect.id}`;
    try {
      const adminTpl = renderAdminInstitutionnelEcoleRequest({
        type: requestType,
        orgName: data.org_name,
        contactName: data.contact_name,
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
        contactName: data.contact_name,
        orgName: data.org_name,
      });
      await sendTransactionalEmailViaResend({
        to: data.contact_email,
        toName: data.contact_name,
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
