/**
 * GET /api/affilie/kit/banner-linkedin.png — P7.x.1.E-ter
 *
 * Banniere LinkedIn 1200x627 (format share image) generee via next/og.
 *
 * Layout E-ter (refonte) :
 *   - Gauche 50% (600px) : photo principale `affilie-hero.png` full-bleed
 *     + badge "EDITION 2026 · NOUVEAU" en bas gauche sur overlay.
 *   - Droite 50% (600px) : header logos pleine largeur (MDS + PRS, 50/50
 *     avec divider central) puis stack texte :
 *       L1 : titre grand bold "Les MediaDays Solutions 2026"
 *       L2 : tagline subtle "— Le NOUVEAU rendez-vous des medias"
 *       L3 : poles accentues magenta (Audio · Diffusion · Video ·
 *            Outdoor · Data & adtech)
 *       L4 : dates+villes avec drapeaux emoji
 *     Footer : CTA "Reservez votre stand" + URL tracking en magenta
 *     visible, et "Recommande par {nom}" en sous-pied discret.
 *
 * Mini-thumbs venues retires (P7.x.1.E-ter). Les drapeaux 🇧🇪🇫🇷 restent
 * uniquement en emoji dans la ligne dates.
 *
 * Auth : session affilie via cookie (source de verite).
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  const logoMds = `${baseUrl}/brand/MDS-LogoBlanc-badge.png`;
  const logoPrs = `${baseUrl}/brand/PRS-LogoBlanc-badge.png`;
  const heroImage = `${baseUrl}/landing/affilie-hero.png`;
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
      {/* Colonne gauche 50% : photo brand hero + badge ÉDITION */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: 600,
          height: 627,
          background: '#0a1f60',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroImage}
          alt="MediaDays Solutions 2026"
          width={600}
          height={627}
          style={{
            width: 600,
            height: 627,
            objectFit: 'cover',
          }}
        />
        {/* Overlay dégradé bas pour lisibilité du badge */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 140,
            background: 'linear-gradient(180deg, rgba(3,26,86,0) 0%, rgba(3,26,86,0.75) 100%)',
            display: 'flex',
            alignItems: 'flex-end',
            padding: 28,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.92)',
            }}
          >
            Édition 2026 · NOUVEAU
          </span>
        </div>
      </div>

      {/* Colonne droite 50% : logos pleine largeur + stack texte + CTA */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 600,
          height: 627,
          background: 'linear-gradient(135deg, #031A56 0%, #294294 50%, #E6007E 130%)',
          padding: 40,
        }}
      >
        {/* Header logos PLEINE LARGEUR (50/50) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            height: 96,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 246,
              height: 96,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoMds}
              alt="MediaDays Solutions"
              width={96}
              height={96}
              style={{ width: 96, height: 96, objectFit: 'contain' }}
            />
          </div>
          <div style={{ width: 1, height: 64, background: 'rgba(255,255,255,0.4)' }} />
          <div
            style={{
              display: 'flex',
              width: 246,
              height: 96,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoPrs}
              alt="Paris Radio Show"
              width={96}
              height={96}
              style={{ width: 96, height: 96, objectFit: 'contain' }}
            />
          </div>
        </div>

        {/* Stack texte */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginTop: 36,
            flex: 1,
          }}
        >
          {/* L1 : titre */}
          <span
            style={{
              fontSize: 32,
              fontWeight: 900,
              lineHeight: 1.1,
              color: 'white',
            }}
          >
            Les MediaDays Solutions 2026
          </span>
          {/* L2 : tagline subtle */}
          <span
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.85)',
              lineHeight: 1.3,
            }}
          >
            — Le NOUVEAU rendez-vous des médias
          </span>
          {/* L3 : pôles accentués magenta */}
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#FFB1D2',
              marginTop: 12,
              lineHeight: 1.35,
            }}
          >
            Audio · Diffusion · Vidéo · Outdoor · Data & adtech
          </span>
          {/* L4 : dates + villes */}
          <span
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: 'white',
              marginTop: 8,
              lineHeight: 1.35,
            }}
          >
            🇧🇪 26 nov Bruxelles · 🇫🇷 10 déc Marseille · 🇫🇷 15 déc Paris
          </span>
        </div>

        {/* CTA bas droite très visible + footer affilié */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            paddingTop: 18,
            borderTop: '2px solid rgba(255,255,255,0.3)',
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>
            👉 Réservez votre stand
          </span>
          <span
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: '#FFB1D2',
              letterSpacing: 0.5,
            }}
          >
            {trackingUrl}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.55)',
              marginTop: 8,
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
        'cache-control': 'private, max-age=300',
      },
    },
  );
}
