/**
 * GET /i/[companyId] — P5.x.16 + P5.x.16-bis (slug court + UUID retrocompat).
 *
 * Route redirect courte pour les liens d'invitation visiteurs envoyes
 * par les partenaires. Le param URL est volontairement nomme `companyId`
 * dans le filesystem pour ne pas casser le routing, mais represente
 * en realite soit :
 *   - le slug court nominatif de la company (P5.x.16-bis, defaut)
 *   - le UUID complet (retrocompat liens deja envoyes pendant P5.x.16)
 *
 * Pattern :
 *   1. Lookup par slug (defaut)
 *   2. Si rien et que le segment ressemble a un UUID -> lookup par id
 *   3. Si toujours rien -> redirect gracieux vers mediadays.net (l'invite
 *      ne doit jamais voir une 404)
 *   4. Log fire-and-forget dans visitor_invitations_clicks
 *   5. Redirect 302 vers mediadays.net
 *
 * RGPD : on hash l'IP en SHA256 (ip_hash) au lieu de la stocker brute.
 *
 * Logs : prefix [i/redirect].
 */

import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[i/redirect]';
const REDIRECT_TARGET = 'https://mediadays.net';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ companyId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { companyId: identifier } = await params;
  const supabase = getSupabaseServiceClient();

  // 1. Lookup par slug (cas nominal P5.x.16-bis).
  let resolvedCompanyId: string | null = null;
  {
    const { data: bySlug } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', identifier)
      .maybeSingle();
    if (bySlug?.id) {
      resolvedCompanyId = bySlug.id;
    }
  }

  // 2. Fallback UUID (retrocompat).
  if (!resolvedCompanyId && UUID_RE.test(identifier)) {
    const { data: byId } = await supabase
      .from('companies')
      .select('id')
      .eq('id', identifier)
      .maybeSingle();
    if (byId?.id) {
      resolvedCompanyId = byId.id;
    }
  }

  // 3. Pas trouve -> redirect gracieux.
  if (!resolvedCompanyId) {
    console.warn('%s unknown-identifier-redirect-gracious id=%s', LOG_PREFIX, identifier);
    return NextResponse.redirect(REDIRECT_TARGET, { status: 302 });
  }

  // 4. Log click best-effort.
  const ipRaw = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const ipHash = createHash('sha256').update(ipRaw).digest('hex');
  const userAgent = req.headers.get('user-agent');
  const referrer = req.headers.get('referer');

  void supabase
    .from('visitor_invitations_clicks')
    .insert({
      company_id: resolvedCompanyId,
      ip_hash: ipHash,
      user_agent: userAgent,
      referrer: referrer,
    })
    .then(({ error: insertErr }) => {
      if (insertErr) {
        console.error(
          '%s insert-failed company=%s msg=%s',
          LOG_PREFIX,
          resolvedCompanyId,
          insertErr.message,
        );
      }
    });

  console.log('%s redirect identifier=%s -> company=%s', LOG_PREFIX, identifier, resolvedCompanyId);
  return NextResponse.redirect(REDIRECT_TARGET, { status: 302 });
}
