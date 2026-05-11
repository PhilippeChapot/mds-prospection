/**
 * syncCompanyLogoFromConnectonair — P5.x.12 stub, V1.3 implementation.
 *
 * Helper qui sera implemente en V1.3 quand l'API HMAC Connectonair
 * sera disponible (cf. doc COWORK/Connectonair-API-Specs-MDS.md).
 *
 * Aujourd'hui V1.2 : retourne skipped + reason. Le cron
 * `/api/cron/sync-connectonair-logos` (a creer en V1.3) iterera sur
 * les companies sans logo manuel et appellera ce helper.
 *
 * Doctrine de precedence (a respecter en V1.3) :
 *   - Si `companies.logo_source = 'manual_upload'` : SKIP, l'exposant
 *     a la main (cf. P5.x.12 doctrine)
 *   - Sinon, fetch /api/companies/{coa_id}/logo signe HMAC
 *   - Si retourne une URL : UPDATE logo_url + logo_source='connectonair_sync'
 *   - Si 404 / pas de logo cote Connectonair : SKIP
 */

export type SyncLogoResult =
  | { ok: true; logoUrl: string }
  | {
      ok: false;
      skipped: true;
      reason:
        | 'connectonair_api_secret_missing'
        | 'connectonair_api_not_available'
        | 'manual_upload_protected'
        | 'company_not_found'
        | 'no_connectonair_id'
        | 'logo_not_found_upstream';
    };

export async function syncCompanyLogoFromConnectonair(companyId: string): Promise<SyncLogoResult> {
  // V1.2 stub : on n'a pas encore d'API Connectonair branchee. Le helper
  // est cable mais retourne systematiquement skipped pour signaler au
  // cron V1.3 (quand il existera) que rien n'a ete fait.
  if (!process.env.CONNECTONAIR_API_SECRET) {
    return {
      ok: false,
      skipped: true,
      reason: 'connectonair_api_secret_missing',
    };
  }

  // V1.3 TODO :
  //   1. Lookup company.connectonair_id, logo_source depuis DB
  //   2. Si logo_source='manual_upload' -> SKIP (precedence)
  //   3. Si !connectonair_id -> SKIP (no_connectonair_id)
  //   4. Appel signe HMAC GET /api/companies/{coa_id}/logo
  //   5. Si 200 + url -> UPDATE companies SET logo_url=..., logo_source='connectonair_sync'
  //   6. Sinon -> SKIP
  void companyId;
  return {
    ok: false,
    skipped: true,
    reason: 'connectonair_api_not_available',
  };
}
