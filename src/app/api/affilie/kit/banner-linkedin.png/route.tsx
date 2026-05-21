/**
 * GET /api/affilie/kit/banner-linkedin.png — P7.x.1.E (refonte B2B)
 *
 * Banniere LinkedIn 1200x627 (format share image) generee via next/og.
 *
 * Layout B2B (refonte E) :
 *   - Split horizontal 50/50
 *   - Gauche  : 3 photos venues empilees (Marseille / Paris / Bruxelles)
 *               sur fond marine, avec libelle ville + date sous chaque
 *   - Droite  : fond gradient marine -> magenta avec
 *       * Logos MDS + PRS en haut
 *       * Headline "Vos prochains clients pro sont à MediaDays 2026"
 *       * 3 dates inline
 *       * CTA "Réservez votre stand → mediadays.solutions/?ref={token}"
 *       * Footer discret "Recommandé par {affilie}"
 *
 * Auth : session affilie via cookie (source de verite, pas de token URL
 * pour eviter les conflits typage Next.js sur segments [param].png).
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

const VENUES = [
  { label: 'Bruxelles', date: '26 nov', image: '/landing/etape-bruxelles.png', flag: '🇧🇪' },
  { label: 'Marseille', date: '10 déc', image: '/landing/etape-marseille.png', flag: '🇫🇷' },
  { label: 'Paris', date: '15 déc', image: '/landing/etape-paris.png', flag: '🇫🇷' },
] as const;

export async function GET(): Promise<Response> {
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

  const supabase = getSupabaseServiceClient();
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, display_name, token, is_active')
    .eq('id', affiliateId)
    .maybeSingle();

  if (!affiliate || !affiliate.is_active) {
    return new Response('Not Found', { status: 404 });
  }

  // Satori (next/og) ne peut pas resoudre les paths /public via les <img/>
  // sans hostname — on passe par baseUrl absolu pour charger les assets.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  const logoMds = `${baseUrl}/brand/MDS-LogoBlanc-badge.png`;
  const logoPrs = `${baseUrl}/brand/PRS-LogoBlanc-badge.png`;
  const trackingUrl = `mediadays.solutions/?ref=${encodeURIComponent(affiliate.token)}`;

  console.log('%s render affiliate=%s', LOG_PREFIX, affiliateId);

  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'row',
        background: '#031A56',
        fontFamily: 'system-ui',
        color: 'white',
      }}
    >
      {/* Colonne gauche 50% : 3 photos venues empilees */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 600,
          height: 627,
          background: '#0a1f60',
        }}
      >
        {VENUES.map((venue) => (
          <div
            key={venue.label}
            style={{
              display: 'flex',
              flex: 1,
              position: 'relative',
              borderBottom: '2px solid rgba(255,255,255,0.08)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${baseUrl}${venue.image}`}
              alt={venue.label}
              width={600}
              height={209}
              style={{
                width: 600,
                height: 209,
                objectFit: 'cover',
                opacity: 0.92,
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                left: 16,
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                background: 'rgba(3,26,86,0.85)',
                padding: '6px 14px',
                borderRadius: 6,
              }}
            >
              <span style={{ fontSize: 22 }}>{venue.flag}</span>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{venue.date}</span>
              <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.9 }}>{venue.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Colonne droite 50% : pitch B2B + logos + CTA */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 600,
          height: 627,
          background: 'linear-gradient(135deg, #031A56 0%, #294294 50%, #E6007E 130%)',
          padding: 48,
        }}
      >
        {/* Logos MDS + PRS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoMds} alt="MediaDays Solutions" width={140} height={48} />
          <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.4)' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoPrs} alt="Paris Radio Show" width={140} height={48} />
        </div>

        {/* Headline B2B */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 32,
            flex: 1,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: '#FFB1D2',
            }}
          >
            Édition 2026 · NOUVEAU
          </span>
          <span
            style={{
              fontSize: 36,
              fontWeight: 900,
              lineHeight: 1.1,
              marginTop: 10,
            }}
          >
            Vos prochains clients pro
          </span>
          <span
            style={{
              fontSize: 36,
              fontWeight: 900,
              lineHeight: 1.1,
            }}
          >
            sont à MediaDays 2026
          </span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.85)',
              marginTop: 16,
              lineHeight: 1.45,
            }}
          >
            Régies, annonceurs, agences UDECAM, retailers, éditeurs, producteurs.
          </span>
        </div>

        {/* CTA + tracking URL */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingTop: 16,
            borderTop: '2px solid rgba(255,255,255,0.25)',
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>
            👉 Réservez votre stand
          </span>
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: '#FFB1D2',
              letterSpacing: 0.5,
            }}
          >
            {trackingUrl}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.55)',
              marginTop: 6,
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            Recommandé par {affiliate.display_name}
          </span>
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 627,
      headers: {
        // Pas de cache CDN agressif : le nom affilie peut changer.
        'cache-control': 'private, max-age=300',
      },
    },
  );
}
