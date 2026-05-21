/**
 * GET /api/affilie/kit/banner-linkedin.png — P7.x.1.E-bis (refonte layout)
 *
 * Banniere LinkedIn 1200x627 (format share image) generee via next/og.
 *
 * Layout E-bis :
 *   - Gauche 60% (720px) : photo principale brand `affilie-hero.png`
 *     en full-bleed (cover). Overlay degrade en bas pour rester
 *     lisible si Phil ajoute du texte.
 *   - Droite 40% (480px) : fond gradient marine -> magenta avec
 *       * Header logos MDS + PRS (badge square, rendus a 56x56)
 *       * Headline B2B "Vos prochains clients pro sont AUX MediaDays 2026"
 *         (pluriel correct + 5 poles tech mentionnes)
 *       * 3 dates inline avec mini-thumbs venues (cercles 60x60)
 *       * CTA "Reservez votre stand → mediadays.solutions/?ref=..."
 *       * Footer "Recommande par {affilie}"
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
  { label: 'Bruxelles', date: '26 nov', thumb: '/landing/etape-bruxelles.png', flag: '🇧🇪' },
  { label: 'Marseille', date: '10 déc', thumb: '/landing/etape-marseille.png', flag: '🇫🇷' },
  { label: 'Paris', date: '15 déc', thumb: '/landing/etape-paris.png', flag: '🇫🇷' },
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

  // Satori (next/og) requiert des URLs absolues pour resoudre les <img/>.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  // E-bis : badge logos en haute resolution (1600x1600) — rendus square
  // a 56px ils sont nets et non distordus.
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
      {/* Colonne gauche 60% : photo brand hero */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: 720,
          height: 627,
          background: '#0a1f60',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroImage}
          alt="MediaDays Solutions 2026"
          width={720}
          height={627}
          style={{
            width: 720,
            height: 627,
            objectFit: 'cover',
          }}
        />
        {/* Overlay degrade bas pour mieux lire le label superpose */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 160,
            background: 'linear-gradient(180deg, rgba(3,26,86,0) 0%, rgba(3,26,86,0.7) 100%)',
            display: 'flex',
            alignItems: 'flex-end',
            padding: 28,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            Édition 2026 · NOUVEAU
          </span>
        </div>
      </div>

      {/* Colonne droite 40% : header logos + pitch B2B + venues + CTA */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 480,
          height: 627,
          background: 'linear-gradient(135deg, #031A56 0%, #294294 50%, #E6007E 130%)',
          padding: 36,
        }}
      >
        {/* Header logos badges (carres) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoMds}
            alt="MediaDays Solutions"
            width={56}
            height={56}
            style={{ width: 56, height: 56, objectFit: 'contain' }}
          />
          <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.4)' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoPrs}
            alt="Paris Radio Show"
            width={56}
            height={56}
            style={{ width: 56, height: 56, objectFit: 'contain' }}
          />
        </div>

        {/* Headline B2B */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            marginTop: 28,
            flex: 1,
          }}
        >
          <span
            style={{
              fontSize: 30,
              fontWeight: 900,
              lineHeight: 1.1,
            }}
          >
            Vos prochains clients pro
          </span>
          <span
            style={{
              fontSize: 30,
              fontWeight: 900,
              lineHeight: 1.1,
            }}
          >
            sont aux MediaDays 2026
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.85)',
              marginTop: 14,
              lineHeight: 1.4,
            }}
          >
            5 pôles tech : audio · diffusion · vidéo & CTV · outdoor & DOOH · data & adtech.
          </span>
        </div>

        {/* 3 dates inline avec mini-thumbs venues (cercles 60x60) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            marginTop: 16,
            marginBottom: 18,
          }}
        >
          {VENUES.map((venue) => (
            <div
              key={venue.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                width: 120,
              }}
            >
              {/* Mini-thumb venue (cercle 60x60) */}
              <div
                style={{
                  display: 'flex',
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  overflow: 'hidden',
                  border: '2px solid rgba(255,255,255,0.6)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${baseUrl}${venue.thumb}`}
                  alt={venue.label}
                  width={60}
                  height={60}
                  style={{ width: 60, height: 60, objectFit: 'cover' }}
                />
              </div>
              <span style={{ fontSize: 16, marginTop: 4 }}>{venue.flag}</span>
              <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.1 }}>{venue.date}</span>
              <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{venue.label}</span>
            </div>
          ))}
        </div>

        {/* CTA + footer affilie */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            paddingTop: 14,
            borderTop: '2px solid rgba(255,255,255,0.25)',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>
            👉 Réservez votre stand
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: '#FFB1D2',
              letterSpacing: 0.3,
            }}
          >
            {trackingUrl}
          </span>
          <span
            style={{
              fontSize: 9,
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
        'cache-control': 'private, max-age=300',
      },
    },
  );
}
