/**
 * GET /i/[companyId] — P5.x.16.
 *
 * Route redirect courte pour les liens d'invitation visiteurs envoyes
 * par les exposants. Pattern :
 *   1. Verifie que la company existe (sinon redirect gracieux quand
 *      meme vers mediadays.net pour ne pas casser l'experience invite).
 *   2. Log un click dans visitor_invitations_clicks (best-effort, on
 *      n'attend pas l'insertion pour rediriger -- l'invite ne doit
 *      pas attendre une ronde DB).
 *   3. Redirect 302 vers mediadays.net.
 *
 * Format URL volontairement court ("mediadays.solutions/i/<uuid>") pour
 * tenir dans un email/SMS/WhatsApp sans wrapping moche.
 *
 * Pas localise : la route est en racine `src/app/i/[companyId]/` (pas
 * sous `[locale]/`) -- l'invitation est en FR uniquement et l'URL doit
 * rester courte. Le proxy next-intl exclut ce path via le matcher.
 *
 * RGPD : on hash l'IP en SHA256 (ip_hash) au lieu de la stocker brute.
 * Le user-agent et le referrer restent en clair (necessaires pour
 * tagger des sources de trafic).
 *
 * Logs : prefix [i/redirect].
 */

import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[i/redirect]';
const REDIRECT_TARGET = 'https://mediadays.net';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ companyId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { companyId } = await params;
  const supabase = getSupabaseServiceClient();

  // Validation existence company. On garde un redirect gracieux meme
  // en cas d'echec : l'invite ne doit jamais voir une 404.
  const { data: company, error } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle();

  if (error || !company) {
    console.warn('%s unknown-company-redirect-gracious id=%s', LOG_PREFIX, companyId);
    return NextResponse.redirect(REDIRECT_TARGET, { status: 302 });
  }

  // Hash IP en SHA256 (analytics sans PII). En cas d'IP indisponible
  // (header absent), on tape sur "0.0.0.0" -> hash deterministe partage.
  const ipRaw = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const ipHash = createHash('sha256').update(ipRaw).digest('hex');
  const userAgent = req.headers.get('user-agent');
  const referrer = req.headers.get('referer');

  // Fire-and-forget : on n'attend pas l'insert pour rediriger l'invite.
  // L'erreur est logguee mais non bloquante.
  void supabase
    .from('visitor_invitations_clicks')
    .insert({
      company_id: companyId,
      ip_hash: ipHash,
      user_agent: userAgent,
      referrer: referrer,
    })
    .then(({ error: insertErr }) => {
      if (insertErr) {
        console.error(
          '%s insert-failed company=%s msg=%s',
          LOG_PREFIX,
          companyId,
          insertErr.message,
        );
      }
    });

  console.log('%s redirect company=%s', LOG_PREFIX, companyId);
  return NextResponse.redirect(REDIRECT_TARGET, { status: 302 });
}
