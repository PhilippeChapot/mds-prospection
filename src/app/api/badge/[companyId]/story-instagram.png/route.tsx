/**
 * GET /api/badge/[companyId]/story-instagram.png — P5.x.15.
 *
 * Genere une story 1080x1920 (9:16 vertical) via next/og (Satori) pour
 * Instagram Story, Facebook Story, TikTok, Reels.
 *
 * Layout 3 zones (adaptation verticale du pattern badge social
 * P5.x.12.octies) :
 *   - Zone 1 (1080x640)  : bandeau blanc avec logo exposant contained
 *     (960x560 max, padding 60) ou fallback nom societe en gros texte
 *     adaptatif (base 96px).
 *   - Zone 2 (1080x1120) : gradient bleu MDS, tagline "J'EXPOSE AU/AUX"
 *     + logos events 300x300 (MDS + PRS si prs_exhibitor, separes par
 *     trait "|" 120px white_40) + URL mediadays.net.
 *   - Zone 3 (1080x160)  : bandeau blanc avec dates Paris/Marseille sur
 *     2 lignes (le format vertical permet de les empiler proprement
 *     plutot qu'une ligne avec "·").
 *
 * Reutilise les helpers src/lib/social-assets/ (cf P5.x.14).
 *
 * Public : pas d'auth (l'exposant partage l'URL pour ses stories).
 * Logs : prefix [api/story-instagram].
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

const LOG_PREFIX = '[api/story-instagram]';

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

  // Format vertical => plus de place verticale, base 96px.
  const fallbackFontSize = adaptiveFontSize(company.name, 96);
  const filename = `story-instagram-mds-2026-${slugify(company.name)}.png`;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: BRAND_COLORS.WHITE,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {/* ZONE 1 — bandeau blanc 1080x640 : logo exposant ou fallback nom */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 640,
          background: BRAND_COLORS.WHITE,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 60,
        }}
      >
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDataUrl}
            alt=""
            style={{ maxWidth: 960, maxHeight: 560, objectFit: 'contain' }}
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
              maxWidth: 960,
            }}
          >
            {company.name}
          </div>
        )}
      </div>

      {/* ZONE 2 — gradient bleu 1080x1120 : tagline + logos + URL */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          background: BRAND_COLORS.GRADIENT_BLUE,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
          gap: 60,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 48,
            color: BRAND_COLORS.WHITE_90,
            letterSpacing: '0.3em',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {wording}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoMdsUrl} alt="" width={300} height={300} />
          {isPrs ? (
            <>
              <div
                style={{
                  display: 'flex',
                  color: BRAND_COLORS.WHITE_40,
                  fontSize: 120,
                  lineHeight: 1,
                }}
              >
                |
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoPrsUrl} alt="" width={300} height={300} />
            </>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 48,
            color: BRAND_COLORS.WHITE,
            fontWeight: 600,
          }}
        >
          mediadays.net
        </div>
      </div>

      {/* ZONE 3 — bandeau blanc 1080x160 : dates sur 2 lignes en bleu MDS */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: 160,
          background: BRAND_COLORS.WHITE,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 32,
            color: BRAND_COLORS.MDS_BLUE,
            fontWeight: 600,
          }}
        >
          {EVENT_DATES.PARIS_FR}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 32,
            color: BRAND_COLORS.MDS_BLUE,
            fontWeight: 600,
          }}
        >
          {EVENT_DATES.MARSEILLE_FR}
        </div>
      </div>
    </div>,
    {
      width: 1080,
      height: 1920,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
