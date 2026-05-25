/**
 * syncSignupLifecycle — P5.x.8 Phase C.
 *
 * Helper exporte appele depuis :
 *   - /api/signup/verify (apres verified_at set)
 *   - /api/signup/step2/submit (apres step2_submitted_at set)
 *   - /admin/signups/[id] convertSignupToProspect (securite : apres
 *     conversion, le contact doit naturellement sortir de la liste,
 *     mais on appelle quand meme pour propager les attributs et garantir
 *     l'unlink — meme si dans 99% des cas le helper prospect-side
 *     P5.x.4 fait deja l'unlink via unlinkListIds + getMdsLifecycleListIds).
 *
 * Logique :
 *   - Lit signup row
 *   - Calcule isVerifiedNotConverted = !!verified_at && !step2_submitted_at && !converted_to_prospect_id
 *   - Si true : ajoute le contact a BREVO_LIST_ID_VERIFIED_NOT_CONVERTED
 *   - Sinon : retire le contact de cette liste (via unlinkListIds, cf.
 *     getMdsLifecycleListIds qui inclut VERIFIED_NOT_CONVERTED)
 *
 * Best-effort : ne throw jamais — on log, on update last_sync_error
 * sur le signup pour visibilite admin.
 *
 * Logs structures (prefix [brevo/sync-signup-lifecycle]).
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { upsertContactBrevo } from './lifecycle';
import { logBrevoCall } from './sync-logger';

const LOG_PREFIX = '[brevo/sync-signup-lifecycle]';

export interface SyncSignupLifecycleResult {
  ok: boolean;
  skipped?: 'signup_not_found' | 'no_email' | 'no_list_configured';
  error?: string;
}

export async function syncSignupLifecycle(signupId: string): Promise<SyncSignupLifecycleResult> {
  const supabase = getSupabaseServiceClient();
  const { data: signup, error } = await supabase
    .from('public_signup_attempts')
    .select(
      `
      id, email, contact_first_name, contact_last_name, language,
      verified_at, step2_submitted_at, converted_to_prospect_id,
      short_token, marketing_consent, derived_category
      `,
    )
    .eq('id', signupId)
    .maybeSingle();

  if (error || !signup) {
    console.warn('%s signup-not-found id=%s', LOG_PREFIX, signupId);
    return { ok: false, skipped: 'signup_not_found' };
  }

  if (!signup.email) {
    return { ok: false, skipped: 'no_email' };
  }

  const isVerifiedNotConverted =
    !!signup.verified_at && !signup.step2_submitted_at && !signup.converted_to_prospect_id;

  // Build SIGNUP_RESUME_URL : pointe vers /[locale]/inscription-exposant/etape-2
  // via la route DOI verify (qui set le cookie session et redirect step2).
  // L'URL utilise short_token, valide 14j (P5.x.8 update).
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  const locale = (signup.language ?? 'FR').toLowerCase() === 'en' ? 'en' : 'fr';
  const resumeUrl = signup.short_token
    ? `${baseUrl}/api/signup/verify?t=${encodeURIComponent(signup.short_token)}&loc=${locale}`
    : null;

  // Calcul cible : si verified-not-converted, on inclut la liste
  // VERIFIED_NOT_CONVERTED ; sinon on passe une liste vide (l'unlinkListIds
  // d'upsertContactBrevo prendra en charge le retrait via la pool
  // lifecycle qui contient cette liste).
  const verifiedListId = parseListId(process.env.BREVO_LIST_ID_VERIFIED_NOT_CONVERTED);
  if (verifiedListId == null) {
    console.warn(
      '%s no-list-configured BREVO_LIST_ID_VERIFIED_NOT_CONVERTED missing — skip',
      LOG_PREFIX,
    );
    return { ok: false, skipped: 'no_list_configured' };
  }

  const listIdsOverride = isVerifiedNotConverted ? [verifiedListId] : [];

  try {
    await upsertContactBrevo({
      email: signup.email,
      firstName: signup.contact_first_name,
      lastName: signup.contact_last_name,
      pole: 'INCONNU',
      category: signup.derived_category ?? 'standard',
      language: (signup.language ?? 'FR') === 'EN' ? 'EN' : 'FR',
      marketingConsent: Boolean(signup.marketing_consent),
      // P5.x.8 — listIdsOverride bypasse la resolution pole/category
      // (qu'on n'a pas pour un signup pas encore converti) et passe
      // directement la liste signup-lifecycle. unlinkListIds est calcule
      // automatiquement par upsertContactBrevo : tout ce qui est dans
      // getMdsLifecycleListIds() et pas dans listIdsOverride est unlink.
      listIdsOverride,
      signupResumeUrl: resumeUrl,
    });

    console.log(
      '%s success signup=%s email=%s verified_not_converted=%s',
      LOG_PREFIX,
      signupId,
      signup.email,
      isVerifiedNotConverted,
    );

    // P4.x.1 — sync_logs (audit Brevo signup-side).
    await logBrevoCall({
      entityType: 'public_signup_attempts',
      entityId: signupId,
      operation: 'update',
      status: 'success',
      payload: {
        flow: 'signup_lifecycle',
        isVerifiedNotConverted,
        email: signup.email,
      },
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed signup=%s msg=%s', LOG_PREFIX, signupId, msg);
    await logBrevoCall({
      entityType: 'public_signup_attempts',
      entityId: signupId,
      operation: 'update',
      status: 'error',
      errorMessage: msg,
      payload: { flow: 'signup_lifecycle', email: signup.email },
    });
    return { ok: false, error: msg };
  }
}

function parseListId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
