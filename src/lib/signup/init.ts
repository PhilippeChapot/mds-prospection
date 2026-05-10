/**
 * Logique metier de POST /api/signup/init.
 *
 * Decouple de la route handler pour pouvoir etre testee/reutilisee
 * (resend-doi reuse une partie des helpers).
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { verifyHCaptchaToken } from '@/lib/hcaptcha/verify';
import { verifyEmailDeliverability, isDeliverable } from '@/lib/neverbounce/verify';
import { classifySignup, extractEmailDomain } from '@/lib/ai/classify-signup';
import { signDoiToken, computeDoiExpiresAt } from '@/lib/doi/jwt';
import { generateShortToken, computeShortTokenExpiresAt } from '@/lib/doi/short-token';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { renderDoiTemplate } from '@/lib/resend/templates/doi';
import { verifyVatNumber, EU_COUNTRIES_NON_FR } from '@/lib/vies/verify';
import freeProviders from 'free-email-domains';
import disposableProviders from 'disposable-email-domains';
import type { SignupStep1Input, SignupInitErrorCode } from './schema';

export interface InitSignupResult {
  ok: boolean;
  signupId?: string;
  error?: SignupInitErrorCode;
}

const FREE_PROVIDER_SET = new Set<string>(freeProviders as string[]);
const DISPOSABLE_PROVIDER_SET = new Set<string>(disposableProviders as string[]);

/**
 * Map NeverBounce result + domain heuristics -> public.email_validation_status enum.
 */
function mapEmailValidationStatus(
  neverBounceResult: string,
  emailDomain: string | null,
): 'valid' | 'free_provider' | 'disposable' | 'domain_mismatch' {
  if (neverBounceResult === 'disposable') return 'disposable';
  if (emailDomain && DISPOSABLE_PROVIDER_SET.has(emailDomain)) return 'disposable';
  if (emailDomain && FREE_PROVIDER_SET.has(emailDomain)) return 'free_provider';
  return 'valid';
}

/**
 * Calcule la categorie tarifaire derivee depuis category declaree
 * + statut PRS de la societe matchee.
 *
 *   exposant + societe PRS connue          -> prs_exhibitor (Cas A)
 *   exposant + societe non PRS / inconnue  -> standard      (Cas B)
 *   partenaire                              -> standard      (Cas B)
 */
async function deriveCategory(
  category: 'exposant' | 'partenaire',
  companyId: string | null,
): Promise<'prs_exhibitor' | 'standard' | 'non_eligible'> {
  if (category === 'partenaire') return 'standard';
  if (!companyId) return 'standard';

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('companies')
    .select('was_prs_2026_exhibitor')
    .eq('id', companyId)
    .maybeSingle();

  if (error || !data) return 'standard';
  return data.was_prs_2026_exhibitor ? 'prs_exhibitor' : 'standard';
}

/**
 * Anti-doublon : verifie qu'aucun signup pending dans les 24h pour cet email
 * + qu'aucun contact deja lie a un prospect actif.
 */
async function checkDuplicates(email: string): Promise<SignupInitErrorCode | null> {
  const supabase = getSupabaseServiceClient();
  const lowerEmail = email.toLowerCase();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1. Pending signup recent ?
  const { data: pending } = await supabase
    .from('public_signup_attempts')
    .select('id')
    .ilike('email', lowerEmail)
    .eq('status', 'awaiting_verification')
    .gte('created_at', since)
    .limit(1);

  if (pending && pending.length > 0) {
    return 'email_duplicate_recent';
  }

  // 2. Contact deja lie a un prospect actif ?
  // On filtre sur les statuts non-finaux (lead/qualified/quoted/etc, exclut 'lost').
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, prospects:prospects!primary_contact_id(id, status)')
    .ilike('email', lowerEmail)
    .limit(5);

  if (contacts && contacts.length > 0) {
    for (const contact of contacts) {
      const prospects = contact.prospects as Array<{ status: string }> | null;
      if (prospects && prospects.some((p) => p.status !== 'lost')) {
        return 'email_duplicate_prospect';
      }
    }
  }

  return null;
}

interface BuildDoiUrlInput {
  locale: 'fr' | 'en';
  token: string;
}

/**
 * URL DOI dans l'email Brevo : pointe vers la route handler /api/signup/verify
 * (qui verify + set cookie + redirect 302 vers /[locale]/inscription-exposant/step2).
 *
 * On evite de mettre le token dans une page Server Component car Next 15+
 * interdit cookies().set() depuis un SC. Une route handler peut faire les deux.
 *
 * Format URL court (depuis P3 M5.4-bis) : `?t=<short16>&loc=<fr|en>`
 *   -> ~80 chars total au lieu de ~300 avec le JWT
 *   -> evite les 404 du tracker Brevo sur longues URLs.
 *
 * `loc` est passe en query pour que le redirect post-verify aille a la
 * bonne locale meme si la lecture DB rate (best-effort fallback).
 */
export function buildDoiUrl({ locale, token }: BuildDoiUrlInput): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const params = new URLSearchParams({ t: token, loc: locale });
  return `${base}/api/signup/verify?${params.toString()}`;
}

interface SendDoiInput {
  email: string;
  firstName: string;
  locale: 'fr' | 'en';
  token: string;
}

export async function sendDoiEmail(input: SendDoiInput): Promise<void> {
  const doiUrl = buildDoiUrl({ locale: input.locale, token: input.token });
  const template = renderDoiTemplate(input.locale, {
    firstName: input.firstName,
    doiUrl,
  });

  // Resend : pas de tracker custom qui wrappe les liens, contrairement a
  // Brevo (cf. memoire project_brevo_tracker_bug.md). Le bouton "Confirmer
  // mon adresse" pointe directement vers /api/signup/verify.
  await sendTransactionalEmailViaResend({
    to: input.email,
    toName: input.firstName,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [
      { name: 'category', value: 'doi' },
      { name: 'locale', value: input.locale },
    ],
  });
}

interface InitSignupContext {
  ip: string;
  userAgent: string | null;
  /**
   * P5.x.7 : token affilie lu depuis le cookie `mds_affiliate_ref`.
   * null si pas de cookie ou format invalide. Sera resolu en
   * `affiliate_id` via lookup `affiliates.token` si match (et
   * is_active=true) ; sinon, on persiste null.
   */
  affiliateToken?: string | null;
}

export async function initSignup(
  input: SignupStep1Input,
  ctx: InitSignupContext,
): Promise<InitSignupResult> {
  // 1. Honeypot rempli -> 200 silencieux pour ne pas reveler la regle au bot.
  if (input.honeypot && input.honeypot.length > 0) {
    return { ok: true, signupId: 'honeypot-noop' };
  }

  // 2. hCaptcha
  const captcha = await verifyHCaptchaToken(input.hcaptchaToken ?? null, ctx.ip);
  if (!captcha.success) {
    return { ok: false, error: 'captcha_failed' };
  }

  // 3. NeverBounce
  const nb = await verifyEmailDeliverability(input.email);
  if (!isDeliverable(nb.result)) {
    return { ok: false, error: 'email_undeliverable' };
  }

  // 3.bis Hard-reject free-providers (gmail/yahoo/hotmail/etc) + jetables.
  // Renforce la promesse de la bulle info etape 1 ("nous verifions que l'email
  // est rattache a votre activite professionnelle"). Filtre cote app, en plus
  // du status email_validation_status='free_provider' deja stocke pour audit.
  const freeProviderDomain = extractEmailDomain(input.email);
  if (freeProviderDomain && FREE_PROVIDER_SET.has(freeProviderDomain)) {
    console.log('[signup/init] reject email=%s reason=email_free_provider', input.email);
    return { ok: false, error: 'email_free_provider' };
  }
  if (freeProviderDomain && DISPOSABLE_PROVIDER_SET.has(freeProviderDomain)) {
    console.log('[signup/init] reject email=%s reason=email_disposable', input.email);
    return { ok: false, error: 'email_disposable' };
  }

  // 4. Anti-doublon
  const dup = await checkDuplicates(input.email);
  if (dup) {
    return { ok: false, error: dup };
  }

  // 5. Classification IA (best-effort, swallow errors)
  const emailDomain = extractEmailDomain(input.email);
  const aiResult = await classifySignup({
    companyName: input.companyName,
    companyCountry: input.companyCountry,
    contactFirstName: input.firstName,
    contactLastName: input.lastName,
    category: input.category,
    emailDomain,
  });

  // 6. Derived category (Cas A vs Cas B)
  const derivedCategory = await deriveCategory(input.category, input.companyId ?? null);

  // 6.bis Re-verification VIES (best-effort, hit cache 30j) si le client
  //       a saisi un pays UE non-FR + un numero. On NE fait PAS confiance
  //       au flag vatVerified envoye par le client : on consulte la source
  //       d'autorite (VIES via cache). Si VIES KO, on persiste 'unverified'
  //       et l'admin pourra re-tenter plus tard.
  let vatStatus: 'unverified' | 'pending' | 'valid' | 'invalid' = 'unverified';
  let vatCountryNormalized: string | null = null;
  let vatNumberNormalized: string | null = null;
  let vatVerifiedAt: string | null = null;

  if (
    input.vatCountry &&
    input.vatNumber &&
    (EU_COUNTRIES_NON_FR as readonly string[]).includes(input.vatCountry)
  ) {
    vatCountryNormalized = input.vatCountry.toUpperCase();
    vatNumberNormalized = input.vatNumber
      .replace(/\s/g, '')
      .replace(new RegExp(`^${vatCountryNormalized}`, 'i'), '');

    try {
      const viesResult = await verifyVatNumber(vatCountryNormalized, vatNumberNormalized);
      vatStatus = viesResult.isValid ? 'valid' : 'invalid';
      vatVerifiedAt = new Date().toISOString();
    } catch (err) {
      console.warn(
        '[signup/init] vies-error during persist (status=unverified) msg=%s',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // 6.ter P5.x.7 — lookup affiliate par token (cookie). Si match
  // (et affiliate actif), on resout en affiliate_id pour le persister
  // sur le signup ; sinon on retombe sur null sans crasher.
  const supabase = getSupabaseServiceClient();
  let affiliateId: string | null = null;
  if (ctx.affiliateToken) {
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id, is_active')
      .eq('token', ctx.affiliateToken)
      .maybeSingle();
    if (affiliate?.is_active) {
      affiliateId = affiliate.id;
    } else {
      console.log('[signup/init] affiliate-token-unknown-or-inactive token=%s', ctx.affiliateToken);
    }
  }

  // 7. INSERT signup (status=awaiting_verification, doi_token vide pour l'instant)
  const emailValidationStatus = mapEmailValidationStatus(nb.result, emailDomain);
  const isNewCompany = !input.companyId;

  const { data: inserted, error: insertError } = await supabase
    .from('public_signup_attempts')
    .insert({
      email: input.email,
      email_domain: emailDomain,
      email_validation_status: emailValidationStatus,
      neverbounce_result: nb.result,
      company_name_input: input.companyName,
      matched_company_id: input.companyId ?? null,
      is_new_company: isNewCompany,
      contact_first_name: input.firstName,
      contact_last_name: input.lastName,
      contact_phone: input.phone,
      // Affiliation P3.x : capture texte libre. Sera matchee + commission
      // calculee en P5 vs table affiliates (FK affiliate_id deja en place).
      affiliate_input_raw: input.affiliateInput,
      category: input.category,
      derived_category: derivedCategory,
      language: input.locale === 'fr' ? 'FR' : 'EN',
      marketing_consent: input.consentMarketing,
      ai_classification: aiResult
        ? {
            pole_code: aiResult.poleCode,
            confidence: aiResult.confidence,
            reasoning: aiResult.reasoning,
            model: aiResult.modelUsed,
            tokens_in: aiResult.tokensIn,
            tokens_out: aiResult.tokensOut,
            classified_at: new Date().toISOString(),
          }
        : null,
      ip_address: ctx.ip === 'unknown' ? null : ctx.ip,
      user_agent: ctx.userAgent,
      referrer: input.referrer ?? null,
      utm_source: input.utmSource ?? null,
      utm_medium: input.utmMedium ?? null,
      utm_campaign: input.utmCampaign ?? null,
      // P5.x.1 — TVA UE intracommunautaire (autoliquidation Art. 196).
      vat_country: vatCountryNormalized,
      vat_number: vatNumberNormalized,
      vat_verified: vatStatus,
      vat_verified_at: vatVerifiedAt,
      // P5.x.7 — affilie referent (resolu via cookie token).
      affiliate_id: affiliateId,
      status: 'awaiting_verification',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[signup/init] INSERT failed', insertError);
    return { ok: false, error: 'internal_error' };
  }

  const signupId = inserted.id;

  // 8. Genere les 2 tokens (short_token utilise dans l'URL Brevo, doi_token JWT
  //    conserve pour debug + future compat). UPDATE le signup avec les deux.
  const shortToken = generateShortToken();
  const shortTokenExpiresAt = computeShortTokenExpiresAt();
  const doiToken = await signDoiToken({ signupId, email: input.email });
  const doiExpiresAt = computeDoiExpiresAt();

  const { error: updateError } = await supabase
    .from('public_signup_attempts')
    .update({
      short_token: shortToken,
      short_token_expires_at: shortTokenExpiresAt.toISOString(),
      doi_token: doiToken,
      doi_token_expires_at: doiExpiresAt.toISOString(),
      verification_sent_at: new Date().toISOString(),
    })
    .eq('id', signupId);

  if (updateError) {
    console.error('[signup/init] UPDATE tokens failed', updateError);
    return { ok: false, error: 'internal_error' };
  }

  // 9. Envoi email DOI Brevo avec l'URL courte (short_token, ~80 chars total
  //    pour eviter le 404 du tracker Brevo sur longues URLs JWT).
  //    Best-effort : si KO, on log mais on retourne ok=true pour ne pas
  //    re-creer un duplicate signup. L'admin peut renvoyer manuellement.
  try {
    await sendDoiEmail({
      email: input.email,
      firstName: input.firstName,
      locale: input.locale,
      token: shortToken,
    });
  } catch (err) {
    console.error('[signup/init] Brevo send failed (signup created, retry possible)', err);
  }

  return { ok: true, signupId };
}
