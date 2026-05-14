/**
 * GET /api/badge/[companyId]/zoom-background.png — P5.x.19.
 *
 * Genere un fond visio Zoom/Teams 1920x1080 via next/og (Satori).
 *
 * Layout :
 *   - Zone haute (1920x810) : fond gradient bleu MDS uni, ou apparait
 *     le visage de la personne en surcouche (chroma key Zoom/Teams).
 *   - Bandeau bas (1920x270) : overlay rgba(0,0,0,0.3) sur le gradient,
 *     3 colonnes :
 *       * Logo expo (300x210, fond blanc arrondi, max 260x170)
 *         ou fallback nom societe en grand (base 36px)
 *       * Centre : tagline "J'EXPOSE AU/AUX" (24px) + logos events
 *         130x130 (MDS + PRS si prs_exhibitor, separes par "|" 60px)
 *       * Droite : Paris (22px), Marseille (22px), mediadays.net
 *         (28px semi-bold)
 *
 * Reutilise les helpers src/lib/social-assets/ (cf P5.x.14).
 *
 * Public : pas d'auth (l'exposant importe l'image dans Zoom/Teams).
 * Logs : prefix [api/zoom-background].
 */

import { ImageResponse } from 'next/og';
import {
  BRAND_COLORS,
  EVENT_DATES,
  adaptiveFontSize,
  fetchLogoAsDataUrl,
  getEventLogos,
  getExhibitorWording,
  slugify,
} from '@/lib/social-assets';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[api/zoom-background]';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ companyId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams): Promise<Response> {
  const { companyId } = await params;
  const supabase = getSupabaseServiceClient();
  const { data: company, error } = await supabase
    .from('companies')
    .select('id, name, category, logo_url')
    .eq('id', companyId)
    .maybeSingle();

  if (error || !company) {
    console.warn('%s not-found company=%s', LOG_PREFIX, companyId);
    return new Response('Company not found', { status: 404 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  const { mds: logoMdsUrl, prs: logoPrsUrl } = getEventLogos(baseUrl);
  const isPrs = company.category === 'prs_exhibitor';
  const wording = getExhibitorWording(company.category, 'fr');

  const logoDataUrl = await fetchLogoAsDataUrl(company.logo_url);

  console.log(
    '%s render company=%s name=%s isPrs=%s hasLogoUrl=%s embedded=%s',
    LOG_PREFIX,
    company.id,
    company.name,
    isPrs,
    Boolean(company.logo_url),
    Boolean(logoDataUrl),
  );

  // Zone logo gauche utile 260x170 -> base 36px pour fallback nom.
  const fallbackFontSize = adaptiveFontSize(company.name, 36);
  const filename = `zoom-background-mds-2026-${slugify(company.name)}.png`;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: BRAND_COLORS.GRADIENT_BLUE,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {/* ZONE HAUTE — 1920x810 fond bleu uni (visage de la personne en
          surcouche via chroma key Zoom/Teams) */}
      <div
        style={{
          display: 'flex',
          flex: 1,
        }}
      />

      {/* BANDEAU BAS — 1920x270 : overlay sombre + 3 colonnes */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          height: 270,
          background: 'rgba(0, 0, 0, 0.3)',
          alignItems: 'center',
          padding: '0 80px',
        }}
      >
        {/* Colonne gauche — Logo expo (300x210 fond blanc arrondi) */}
        <div
          style={{
            display: 'flex',
            width: 300,
            height: 210,
            background: BRAND_COLORS.WHITE,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoDataUrl}
              alt=""
              style={{ maxWidth: 260, maxHeight: 170, objectFit: 'contain' }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                fontSize: fallbackFontSize,
                fontWeight: 700,
                color: BRAND_COLORS.MDS_BLUE,
                textAlign: 'center',
                lineHeight: 1.1,
                maxWidth: 260,
              }}
            >
              {company.name}
            </div>
          )}
        </div>

        {/* Colonne centre — Tagline + logos events */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: '0 40px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              color: BRAND_COLORS.WHITE_90,
              letterSpacing: '0.3em',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            {wording}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoMdsUrl} alt="" width={130} height={130} />
            {isPrs ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    color: BRAND_COLORS.WHITE_40,
                    fontSize: 60,
                    lineHeight: 1,
                  }}
                >
                  |
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPrsUrl} alt="" width={130} height={130} />
              </>
            ) : null}
          </div>
        </div>

        {/* Colonne droite — Dates + URL */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 360,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: BRAND_COLORS.WHITE,
              fontWeight: 500,
            }}
          >
            {EVENT_DATES.PARIS_FR}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: BRAND_COLORS.WHITE,
              fontWeight: 500,
            }}
          >
            {EVENT_DATES.MARSEILLE_FR}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              color: BRAND_COLORS.WHITE,
              fontWeight: 600,
              marginTop: 8,
            }}
          >
            mediadays.net
          </div>
        </div>
      </div>
    </div>,
    {
      width: 1920,
      height: 1080,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
