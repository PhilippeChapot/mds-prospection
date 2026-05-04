'use server';

/**
 * Server actions /admin/signups/[id] :
 *   - convertSignupToProspect : pivot principal — crée company + contact +
 *     prospect a partir du signup et flag le signup converted.
 *   - rejectSignup : status='rejected' + reason en notes.
 *   - resendDoi : regenerate JWT + envoi Brevo (pour signups awaiting/expired).
 *   - reclassifySignup : relance Claude Haiku, UPDATE ai_classification.
 *
 * Auth : requireAdminProfile() + check explicite role='admin'.
 *
 * Important : utilise getSupabaseServiceClient() pour pouvoir INSERT dans
 * public.companies / contacts meme si la RLS sales bloque (admin contournee
 * via SECURITY DEFINER, mais service-role bypass tout = simple et previsible).
 */

import { revalidatePath } from 'next/cache';
import { requireAdminProfile, getActiveSeasonId } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { classifySignup, extractEmailDomain } from '@/lib/ai/classify-signup';
import { signDoiToken, computeDoiExpiresAt } from '@/lib/doi/jwt';
import { generateShortToken, computeShortTokenExpiresAt } from '@/lib/doi/short-token';
import { sendDoiEmail } from '@/lib/signup/init';
import { runPostConversion } from '@/lib/sellsy/post-conversion';

export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// convertSignupToProspect
// ---------------------------------------------------------------------------

interface ConvertResult {
  prospectId: string;
}

interface CaseAPayload {
  mode: 'caseA';
  packCode?: 'ACCESS' | 'CLASSIC' | 'PREMIUM';
  pricingTierId?: string;
  parisSelected?: boolean;
  marseilleSelected?: boolean;
  boothPreferences?: string[];
  addonIds?: string[];
  paymentPath?: 'devis_sepa' | 'devis_acompte_stripe' | 'proforma_acompte' | 'facture_integrale';
  cgvAccepted?: boolean;
}

interface CaseBPayload {
  mode: 'caseB';
  interests?: string[];
  pole?: string;
  budget?: string;
  message?: string;
}

export async function convertSignupToProspect(
  signupId: string,
): Promise<ActionResult<ConvertResult>> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    return { success: false, error: 'Réservé aux admins.' };
  }

  const supabase = getSupabaseServiceClient();
  const seasonId = await getActiveSeasonId();

  // 1. Lookup signup
  const { data: signup, error: signupErr } = await supabase
    .from('public_signup_attempts')
    .select(
      'id, email, email_domain, contact_first_name, contact_last_name, contact_phone, company_name_input, matched_company_id, derived_category, language, ai_classification, step2_payload, status, converted_to_prospect_id, affiliate_input_raw',
    )
    .eq('id', signupId)
    .maybeSingle();

  if (signupErr || !signup) {
    return { success: false, error: 'Inscription introuvable.' };
  }
  if (signup.status === 'converted' && signup.converted_to_prospect_id) {
    return {
      success: true,
      data: { prospectId: signup.converted_to_prospect_id },
    };
  }
  if (signup.status !== 'step2_completed') {
    return {
      success: false,
      error: `Conversion possible uniquement depuis status='step2_completed' (actuel : ${signup.status}).`,
    };
  }

  // 2. Find/create company
  let companyId = signup.matched_company_id ?? null;
  if (!companyId) {
    const emailDomain = signup.email_domain ?? extractEmailDomain(signup.email);
    if (emailDomain) {
      const { data: byDomain } = await supabase
        .from('companies')
        .select('id')
        .eq('primary_domain', emailDomain)
        .limit(1);
      companyId = byDomain?.[0]?.id ?? null;
    }
  }
  if (!companyId && signup.company_name_input) {
    const { data: byName } = await supabase
      .from('companies')
      .select('id')
      .ilike('name', signup.company_name_input)
      .limit(1);
    companyId = byName?.[0]?.id ?? null;
  }
  if (!companyId) {
    const aiPole = (signup.ai_classification as { pole_code?: string } | null)?.pole_code;
    const poleId = aiPole ? await getPoleIdByCode(aiPole) : null;
    const name = signup.company_name_input ?? signup.email;
    const { data: created, error: createCoErr } = await supabase
      .from('companies')
      .insert({
        name,
        name_normalized: name.toLowerCase().trim(),
        primary_domain: signup.email_domain ?? extractEmailDomain(signup.email) ?? null,
        country: 'FR', // P3 fallback (pas de pays stocke en signup row, cf. M5 finitions)
        category: signup.derived_category,
        pole_id: poleId,
        pole_classified_by: aiPole ? 'ai' : 'manual',
        was_prs_2026_exhibitor: signup.derived_category === 'prs_exhibitor',
      })
      .select('id')
      .single();
    if (createCoErr || !created) {
      return { success: false, error: `INSERT company: ${createCoErr?.message ?? 'unknown'}` };
    }
    companyId = created.id;
  }

  // 3. Find/create contact
  let contactId: string | null = null;
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id')
    .ilike('email', signup.email)
    .limit(1);
  contactId = existingContact?.[0]?.id ?? null;

  if (!contactId) {
    const { data: newContact, error: contactErr } = await supabase
      .from('contacts')
      .insert({
        company_id: companyId,
        first_name: signup.contact_first_name,
        last_name: signup.contact_last_name,
        email: signup.email,
        phone: signup.contact_phone,
        is_primary: true,
        marketing_consent: false,
        language: signup.language,
      })
      .select('id')
      .single();
    if (contactErr || !newContact) {
      return { success: false, error: `INSERT contact: ${contactErr?.message ?? 'unknown'}` };
    }
    contactId = newContact.id;
  }

  // 4. INSERT prospect
  // Note : prospects n'a pas de pole_id direct — le pole vient de la company
  // jointee. Si la company vient d'etre creee avec le bon pole_id (depuis
  // ai_classification), c'est deja en place.
  const payload = signup.step2_payload as CaseAPayload | CaseBPayload | null;

  const isCaseA = payload?.mode === 'caseA';
  const a = isCaseA ? (payload as CaseAPayload) : null;
  const eventsInterest =
    isCaseA && a
      ? ['paris', ...(a.marseilleSelected ? ['marseille'] : [])]
      : payload?.mode === 'caseB'
        ? []
        : ['paris'];

  // Calcul du montant estime cote serveur depuis pricing_tiers (source de verite).
  const estimatedAmount = await computeEstimatedAmount(a, seasonId);

  const notes = buildProspectNotes(signup, payload);

  const { data: newProspect, error: prospectErr } = await supabase
    .from('prospects')
    .insert({
      season_id: seasonId,
      company_id: companyId,
      primary_contact_id: contactId,
      status: 'lead',
      source: 'inscription_web',
      source_detail: `signup ${signup.id}`,
      events_interest: eventsInterest,
      pack_code: (a?.packCode as 'ACCESS' | 'CLASSIC' | 'PREMIUM') ?? 'A_DEFINIR',
      selected_addon_ids: a?.addonIds ?? [],
      estimated_amount: estimatedAmount,
      payment_path: a?.paymentPath ?? null,
      notes,
      owner_id: profile.id,
    })
    .select('id')
    .single();

  if (prospectErr || !newProspect) {
    return { success: false, error: `INSERT prospect: ${prospectErr?.message ?? 'unknown'}` };
  }

  // 5. UPDATE signup
  const { error: updateSignupErr } = await supabase
    .from('public_signup_attempts')
    .update({
      converted_to_prospect_id: newProspect.id,
      status: 'converted',
    })
    .eq('id', signup.id);

  if (updateSignupErr) {
    console.error('[signups/convert] UPDATE signup failed', updateSignupErr);
    // Le prospect est cree, on ne rollback pas. L'admin peut relier manuellement.
  }

  revalidatePath('/admin/signups');
  revalidatePath(`/admin/signups/${signupId}`);
  revalidatePath('/admin/prospects');
  revalidatePath(`/admin/prospects/${newProspect.id}`);

  // Trigger workflow post-conversion en background (non bloquant) :
  //   1. sync Sellsy (company + individual + opportunity) — P4 M2
  //   2. emission devis/proforma/facture selon payment_path — P4 M3
  //   3. email Resend devis_concierge si devis_sepa — P4 M3
  // L'utilisateur arrive sur /admin/prospects/[id] avec badge "pending"
  // qui devient "synced" / "error" apres ~30s (refresh manuel pour l'instant).
  void runPostConversion(newProspect.id).catch((err) => {
    console.error(
      '[signups/convert] background-post-conversion-failed prospect_id=%s msg=%s',
      newProspect.id,
      err instanceof Error ? err.message : String(err),
    );
  });

  return { success: true, data: { prospectId: newProspect.id } };
}

// ---------------------------------------------------------------------------
// rejectSignup
// ---------------------------------------------------------------------------

export async function rejectSignup(signupId: string, reason?: string): Promise<ActionResult> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    return { success: false, error: 'Réservé aux admins.' };
  }
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from('public_signup_attempts')
    .update({
      status: 'rejected',
      // On stocke la raison dans step2_payload.adminRejection (no-cost,
      // pas de migration). Une future colonne dediee pourra venir en P5.
      step2_payload: reason
        ? { adminRejection: { reason, by: profile.id, at: new Date().toISOString() } }
        : null,
    })
    .eq('id', signupId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/signups');
  revalidatePath(`/admin/signups/${signupId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// resendDoi
// ---------------------------------------------------------------------------

export async function resendDoi(signupId: string): Promise<ActionResult> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    return { success: false, error: 'Réservé aux admins.' };
  }
  const supabase = getSupabaseServiceClient();

  const { data: signup, error } = await supabase
    .from('public_signup_attempts')
    .select('id, email, contact_first_name, language, status')
    .eq('id', signupId)
    .maybeSingle();

  if (error || !signup) {
    return { success: false, error: 'Inscription introuvable.' };
  }
  // Re-envoie possible meme si status='expired' (admin peut relancer).
  if (signup.status === 'converted' || signup.status === 'rejected') {
    return { success: false, error: `Statut ${signup.status} — pas de renvoi.` };
  }

  // Rotation : nouveau short_token (utilise dans l'URL Brevo) + JWT (debug).
  const newShortToken = generateShortToken();
  const newShortTokenExpiresAt = computeShortTokenExpiresAt();
  const newJwt = await signDoiToken({ signupId: signup.id, email: signup.email });
  const newJwtExpiresAt = computeDoiExpiresAt();

  const { error: updateErr } = await supabase
    .from('public_signup_attempts')
    .update({
      short_token: newShortToken,
      short_token_expires_at: newShortTokenExpiresAt.toISOString(),
      doi_token: newJwt,
      doi_token_expires_at: newJwtExpiresAt.toISOString(),
      verification_sent_at: new Date().toISOString(),
      status: 'awaiting_verification',
    })
    .eq('id', signup.id);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  try {
    await sendDoiEmail({
      email: signup.email,
      firstName: signup.contact_first_name ?? '',
      locale: signup.language === 'EN' ? 'en' : 'fr',
      token: newShortToken,
    });
  } catch (err) {
    return { success: false, error: `Brevo: ${(err as Error).message}` };
  }

  revalidatePath(`/admin/signups/${signupId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// reclassifySignup
// ---------------------------------------------------------------------------

export async function reclassifySignup(signupId: string): Promise<ActionResult> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    return { success: false, error: 'Réservé aux admins.' };
  }
  const supabase = getSupabaseServiceClient();

  const { data: signup, error } = await supabase
    .from('public_signup_attempts')
    .select(
      'id, email, email_domain, company_name_input, contact_first_name, contact_last_name, category',
    )
    .eq('id', signupId)
    .maybeSingle();

  if (error || !signup) {
    return { success: false, error: 'Inscription introuvable.' };
  }
  if (!signup.company_name_input || !signup.category) {
    return { success: false, error: 'Champs manquants pour relancer la classification.' };
  }

  if (signup.category !== 'exposant' && signup.category !== 'partenaire') {
    return { success: false, error: 'Catégorie invalide pour reclassification.' };
  }
  const result = await classifySignup({
    companyName: signup.company_name_input,
    companyCountry: null,
    contactFirstName: signup.contact_first_name,
    contactLastName: signup.contact_last_name,
    category: signup.category,
    emailDomain: signup.email_domain ?? extractEmailDomain(signup.email),
  });

  if (!result) {
    return {
      success: false,
      error: 'Echec de la classification IA (clé manquante ou erreur API).',
    };
  }

  const { error: updateErr } = await supabase
    .from('public_signup_attempts')
    .update({
      ai_classification: {
        pole_code: result.poleCode,
        confidence: result.confidence,
        reasoning: result.reasoning,
        model: result.modelUsed,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        classified_at: new Date().toISOString(),
        reclassified: true,
      },
    })
    .eq('id', signup.id);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  revalidatePath(`/admin/signups/${signupId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function getPoleIdByCode(code: string): Promise<string | null> {
  const supabase = getSupabaseServiceClient();
  // Cast volontaire : le type strict de poles.code est une union, mais ici
  // on accepte un string brut venant de l'IA et on retombe sur null si pas
  // de match en DB.
  const { data } = await supabase
    .from('poles')
    .select('id')
    .eq('code', code as never)
    .maybeSingle();
  return data?.id ?? null;
}

async function computeEstimatedAmount(
  payload: CaseAPayload | null,
  seasonId: string,
): Promise<number | null> {
  if (!payload || !payload.pricingTierId) return null;
  const supabase = getSupabaseServiceClient();
  const { data: tier } = await supabase
    .from('pricing_tiers')
    .select('price_eur_ht, marseille_supplement_eur_ht')
    .eq('id', payload.pricingTierId)
    .eq('season_id', seasonId)
    .maybeSingle();
  if (!tier) return null;

  let total = Number(tier.price_eur_ht);
  if (payload.marseilleSelected && tier.marseille_supplement_eur_ht != null) {
    total += Number(tier.marseille_supplement_eur_ht);
  }

  if (payload.addonIds && payload.addonIds.length > 0) {
    const { data: addons } = await supabase
      .from('addon_options')
      .select('price_eur_ht')
      .in('id', payload.addonIds);
    if (addons) {
      for (const a of addons) total += Number(a.price_eur_ht);
    }
  }

  return total;
}

function buildProspectNotes(
  signup: { id: string; language: string; affiliate_input_raw?: string | null },
  payload: CaseAPayload | CaseBPayload | null,
): string {
  const lines: string[] = [
    `Source : inscription web (signup #${signup.id.slice(0, 8)}…)`,
    `Langue : ${signup.language}`,
  ];

  // Bloc affiliation (texte libre P3.x — sera matche en P5 vs table affiliates)
  const affiliateInput = signup.affiliate_input_raw?.trim();
  if (affiliateInput && affiliateInput.length > 0) {
    lines.push('');
    lines.push('--- Référence affiliation ---');
    lines.push(`Référé par : ${affiliateInput}`);
    lines.push("(À valider et lier au système d'affiliation en P5)");
  }

  if (!payload) {
    lines.push('Pas de payload étape 2.');
    return lines.join('\n');
  }

  if (payload.mode === 'caseA') {
    const a = payload as CaseAPayload;
    lines.push('');
    lines.push('--- Étape 2 (Cas A) ---');
    lines.push(`Pack : ${a.packCode ?? '—'}`);
    lines.push(`Salons : Paris${a.marseilleSelected ? ' + Marseille' : ''}`);
    if (a.boothPreferences && a.boothPreferences.length > 0) {
      lines.push(`Emplacements préférés : ${a.boothPreferences.filter(Boolean).join(' / ')}`);
    }
    if (a.addonIds && a.addonIds.length > 0) {
      lines.push(`Addons : ${a.addonIds.length} sélectionné(s)`);
    }
    if (a.paymentPath) lines.push(`Paiement : ${a.paymentPath}`);
  } else if (payload.mode === 'caseB') {
    const b = payload as CaseBPayload;
    lines.push('');
    lines.push('--- Étape 2 (Cas B) ---');
    if (b.interests) lines.push(`Type de présence : ${b.interests.join(', ')}`);
    if (b.pole) lines.push(`Pôle : ${b.pole}`);
    if (b.budget) lines.push(`Budget : ${b.budget}`);
    if (b.message) {
      lines.push('');
      lines.push('Message :');
      lines.push(b.message);
    }
  }

  return lines.join('\n');
}
