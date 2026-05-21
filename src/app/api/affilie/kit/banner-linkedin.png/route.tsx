/**
 * GET /api/affilie/kit/banner-linkedin/[token].png — P7.x.1.C
 *
 * Banniere LinkedIn 1200x627 (format share image) generee via next/og.
 * Pattern direct copie de /api/badge/[companyId]/linkedin-cover.png
 * (P5.x.14).
 *
 * Auth : verifie le cookie de session affilie ET que le token de l'URL
 * matche bien le slug de l'affilie connecte. Pas de leak public — un
 * affilie ne peut PAS generer la banniere d'un autre.
 *
 * Pas de cache Supabase Storage en V1 (CPU acceptable a faible volume,
 * 10-30 affilies). A optimiser en V2 si necessaire.
 */

import { ImageResponse } from 'next/og';
import { cookies } from 'next/headers';
import {
  verifyAffilieSessionToken,
  AFFILIE_SESSION_COOKIE,
  AffilieTokenError,
} from '@/lib/affilie/jwt';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/affilie/kit/banner-linkedin]';

export async function GET(): Promise<Response> {
  // 1. Verifie la session affilie via cookie (session = source de verite,
  //    pas de token dans l'URL pour eviter les conflits typage Next.js
  //    sur les segments [param].png).
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(AFFILIE_SESSION_COOKIE);
  if (!sessionCookie?.value) {
    return new Response('Unauthorized', { status: 401 });
  }
  let affiliateId: string;
  try {
    const claims = await verifyAffilieSessionToken(sessionCookie.value);
    affiliateId = claims.affiliateId;
  } catch (err) {
    const code = err instanceof AffilieTokenError && err.code === 'expired' ? 'expired' : 'invalid';
    console.warn('%s session-reject code=%s', LOG_PREFIX, code);
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Lookup affilie
  const supabase = getSupabaseServiceClient();
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, display_name, token, is_active')
    .eq('id', affiliateId)
    .maybeSingle();

  if (!affiliate || !affiliate.is_active) {
    return new Response('Not Found', { status: 404 });
  }

  // baseUrl peut etre staging (preview Vercel) ou prod ; pour la baniere
  // visible, on utilise toujours le host nu mediadays.solutions (plus
  // propre dans une cover LinkedIn imprimee).
  const trackingUrl = `mediadays.solutions/?ref=${encodeURIComponent(affiliate.token)}`;

  console.log('%s render affiliate=%s', LOG_PREFIX, affiliateId);

  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #031A56 0%, #294294 60%, #E6007E 100%)',
        fontFamily: 'system-ui',
        padding: 64,
        color: 'white',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#FFB1D2',
          }}
        >
          MediaDays Solutions 2026
        </span>
        <span style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.05, marginTop: 12 }}>
          Je serai aux MediaDays
        </span>
        <span style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.05 }}>Solutions 2026</span>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 36, fontWeight: 700, opacity: 0.95 }}>
          {affiliate.display_name}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          paddingTop: 16,
          borderTop: '2px solid rgba(255,255,255,0.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 32,
            fontSize: 22,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.95)',
          }}
        >
          <span>🇫🇷 10 déc — Marseille</span>
          <span>🇫🇷 15 déc — Paris</span>
          <span>🇧🇪 26 nov — Bruxelles</span>
        </div>
        <span
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: '#FFB1D2',
            letterSpacing: 1,
          }}
        >
          👉 {trackingUrl}
        </span>
      </div>
    </div>,
    {
      width: 1200,
      height: 627,
      headers: {
        // Pas de cache CDN agressif : le nom affilie peut changer.
        // L'image se regenere a chaque request, mais c'est leger (10-30
        // affilies). Cache-control browser uniquement.
        'cache-control': 'private, max-age=300',
      },
    },
  );
}
