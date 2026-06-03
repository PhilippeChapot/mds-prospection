/**
 * GET /api/badge/[companyId]/wall-display.png — P5.x.19.
 *
 * Genere un visuel "wall display" pour ecran de stand 1920x1080 via
 * next/og (Satori). Pensez "LinkedIn cover x4 en taille" — tout doit
 * etre lisible a 2-3 metres de distance.
 *
 * Layout 2 colonnes :
 *   - Colonne gauche (960x1080) : fond blanc, logo partenaire contained
 *     (max 900x900, padding 30). Si pas de logo : nom societe en texte
 *     adaptatif tres grand (base 160px) en bleu MDS.
 *   - Colonne droite (960x1080) : gradient bleu MDS avec tagline
 *     "J'EXPOSE AU/AUX" (80px, letterSpacing 0.3em), logos events
 *     500x500 (MDS + PRS si prs_exhibitor, separes par "|" 200px),
 *     dates Paris/Marseille sur 2 lignes (50px chacune), et URL
 *     mediadays.net (60px semi-bold).
 *
 * Reutilise les helpers src/lib/social-assets/ (cf P5.x.14).
 *
 * Public : pas d'auth (l'partenaire affiche le visuel sur son stand).
 * Logs : prefix [api/wall-display].
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

const LOG_PREFIX = '[api/wall-display]';

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

  // Zone gauche utile 900x900 -> base 160px (visible de loin).
  const fallbackFontSize = adaptiveFontSize(company.name, 160);
  const filename = `wall-display-mds-2026-${slugify(company.name)}.png`;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        background: BRAND_COLORS.WHITE,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {/* COLONNE GAUCHE — 960x1080 blanche : logo partenaire ou fallback nom */}
      <div
        style={{
          display: 'flex',
          width: 960,
          height: 1080,
          background: BRAND_COLORS.WHITE,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 30,
        }}
      >
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDataUrl}
            alt=""
            style={{ maxWidth: 900, maxHeight: 900, objectFit: 'contain' }}
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
              maxWidth: 900,
            }}
          >
            {company.name}
          </div>
        )}
      </div>

      {/* COLONNE DROITE — 960x1080 gradient bleu : tagline + logos + dates + URL */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 960,
          height: 1080,
          background: BRAND_COLORS.GRADIENT_BLUE,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 60,
          gap: 60,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 80,
            color: BRAND_COLORS.WHITE_90,
            letterSpacing: '0.3em',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {wording}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 60 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoMdsUrl} alt="" width={500} height={500} />
          {isPrs ? (
            <>
              <div
                style={{
                  display: 'flex',
                  color: BRAND_COLORS.WHITE_40,
                  fontSize: 200,
                  lineHeight: 1,
                }}
              >
                |
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoPrsUrl} alt="" width={500} height={500} />
            </>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 50,
              color: BRAND_COLORS.WHITE,
              fontWeight: 500,
            }}
          >
            {EVENT_DATES.PARIS_FR}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 50,
              color: BRAND_COLORS.WHITE,
              fontWeight: 500,
            }}
          >
            {EVENT_DATES.MARSEILLE_FR}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 60,
            color: BRAND_COLORS.WHITE,
            fontWeight: 600,
          }}
        >
          mediadays.net
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
