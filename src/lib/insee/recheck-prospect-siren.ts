/**
 * P5.x.23 — re-check SIREN au passage signup → prospect.
 *
 * Appelé en background (fire-and-forget) après `convertSignupToProspect`.
 *
 * Comportement :
 *   1. Si company.country !== 'FR' OU company.siren déjà set → no-op
 *   2. Sinon, autoMatchSiren(company.name)
 *   3. Si auto → UPDATE company.siren + siret + verified_at + source
 *   4. Si ambiguous → INSERT admin_alerts (kind='siren_ambiguous',
 *      severity='warning', prospect_id, details={candidates: [...]})
 *   5. Si null → log silencieux (peut être société étrangère ou non immatriculée)
 *
 * L'unique index `admin_alerts_unique_active_prospect (kind, prospect_id)
 * where resolved_at is null` rend l'insert idempotent : on utilise upsert.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { autoMatchSiren, formatSireneAddress } from './sirene';

const LOG_PREFIX = '[siren-recheck]';

export async function recheckCompanySirenForProspect(
  companyId: string,
  prospectId: string,
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data: company, error } = await supabase
    .from('companies')
    .select('id, name, country, siren')
    .eq('id', companyId)
    .maybeSingle();
  if (error || !company) {
    console.warn('%s company-not-found id=%s', LOG_PREFIX, companyId);
    return;
  }

  if (company.country !== 'FR') {
    console.log('%s skip-non-fr company=%s country=%s', LOG_PREFIX, companyId, company.country);
    return;
  }
  if (company.siren) {
    console.log('%s skip-already-set company=%s siren=%s', LOG_PREFIX, companyId, company.siren);
    return;
  }
  if (!company.name) return;

  let match;
  try {
    match = await autoMatchSiren(company.name);
  } catch (err) {
    console.warn(
      '%s api-error company=%s msg=%s',
      LOG_PREFIX,
      companyId,
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  if (!match) {
    console.log('%s no-match company=%s name=%s', LOG_PREFIX, companyId, company.name);
    return;
  }

  if (match.auto) {
    const { error: updateErr } = await supabase
      .from('companies')
      .update({
        siren: match.siren,
        siret: match.siret,
        siren_verified_at: new Date().toISOString(),
        siren_source: 'insee_auto',
      })
      .eq('id', companyId);
    if (updateErr) {
      console.error('%s update-failed company=%s msg=%s', LOG_PREFIX, companyId, updateErr.message);
      return;
    }
    console.log('%s auto-matched company=%s siren=%s', LOG_PREFIX, companyId, match.siren);
    return;
  }

  // Ambiguous → insert admin alert (upsert via unique index)
  const details = {
    candidates: match.candidates.map((c) => ({
      siren: c.siren,
      siret: c.siret,
      denomination: c.uniteLegale.denominationUniteLegale,
      ville: c.adresseEtablissement.libelleCommuneEtablissement,
      address: formatSireneAddress(c.adresseEtablissement),
      siege: c.etablissementSiege,
      etat: c.etablissementSiege ? 'siege' : 'etablissement',
    })),
  };

  const { error: alertErr } = await supabase.from('admin_alerts').upsert(
    {
      kind: 'siren_ambiguous',
      severity: 'warning',
      prospect_id: prospectId,
      message: `${match.candidates.length} SIREN candidats pour « ${company.name} ». Sélection manuelle requise.`,
      details: details as never,
    },
    { onConflict: 'kind,prospect_id', ignoreDuplicates: false },
  );
  if (alertErr) {
    console.error(
      '%s alert-insert-failed company=%s msg=%s',
      LOG_PREFIX,
      companyId,
      alertErr.message,
    );
    return;
  }
  console.log(
    '%s ambiguous-alert-raised company=%s prospect=%s candidates=%d',
    LOG_PREFIX,
    companyId,
    prospectId,
    match.candidates.length,
  );
}
