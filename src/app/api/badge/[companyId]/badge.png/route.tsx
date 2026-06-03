/**
 * GET /api/badge/[companyId]/badge.png — P5.x.12 (.bis...octies) + P5.x.14 refactor.
 *
 * Genere un badge social 1080x1080 via next/og (Satori).
 *
 * Layout P5.x.12.octies (3 zones) :
 *   - Zone 1 (1080x360)  : bandeau blanc avec logo partenaire contained
 *     (1000x280 max, padding 40px). Si pas de logo : nom societe en
 *     gros texte adaptatif.
 *   - Zone 2 (flex:1)    : fond bleu degrade, tagline "J'EXPOSE AU/AUX"
 *     + logos events (MDS + PRS si prs_exhibitor) + URL mediadays.net.
 *   - Zone 3 (1080x100)  : bandeau blanc avec dates "Paris · 15 dec"
 *     et "Marseille · 10 dec" en bleu MDS.
 *
 * P5.x.14 : tout le brand (couleurs, dates, logos events, wording,
 * helpers logo/font) extrait dans src/lib/social-assets/ pour
 * partage avec la banniere LinkedIn (/api/badge/[companyId]/linkedin-cover.png).
 *
 * Public : pas d'auth (l'partenaire partage l'URL pour social media).
 * Logs : prefix [api/badge].
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

const LOG_PREFIX = '[api/badge]';

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

  // P5.x.12.bis : prefetch le logo en data URL avant Satori (Satori ne
  // resout pas systematiquement les URLs Supabase Storage). Best-effort,
  // fallback null -> on tombe sur l'affichage nom societe.
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

  const fallbackFontSize = adaptiveFontSize(company.name, 88);
  const filename = `badge-mds-2026-${slugify(company.name)}.png`;

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
      {/* ZONE 1 — bandeau blanc 1080x360 : logo partenaire contained ou
          fallback nom societe en gros texte adaptatif. */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 360,
          background: BRAND_COLORS.WHITE,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
        }}
      >
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDataUrl}
            alt=""
            style={{ maxWidth: 1000, maxHeight: 280, objectFit: 'contain' }}
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
              maxWidth: 1000,
            }}
          >
            {company.name}
          </div>
        )}
      </div>

      {/* ZONE 2 — fond bleu flex:1 : tagline + logos events + URL. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          background: BRAND_COLORS.GRADIENT_BLUE,
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 60px',
          gap: 40,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 40,
            color: BRAND_COLORS.WHITE_90,
            letterSpacing: '0.3em',
            margin: 0,
            fontWeight: 600,
          }}
        >
          {wording}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 60 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoMdsUrl} alt="" width={400} height={400} />
          {isPrs ? (
            <>
              <div
                style={{
                  display: 'flex',
                  width: 2,
                  height: 160,
                  background: BRAND_COLORS.WHITE_40,
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoPrsUrl} alt="" width={400} height={400} />
            </>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 40,
            color: BRAND_COLORS.WHITE_90,
            fontWeight: 600,
          }}
        >
          mediadays.net
        </div>
      </div>

      {/* ZONE 3 — bandeau blanc bas 1080x100 : dates en bleu MDS. */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 100,
          background: BRAND_COLORS.WHITE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 32,
            color: BRAND_COLORS.MDS_BLUE,
            fontWeight: 600,
          }}
        >
          <span>{EVENT_DATES.PARIS_FR}</span>
          <span
            style={{
              color: BRAND_COLORS.BLUE_FADED,
              margin: '0 24px',
            }}
          >
            ·
          </span>
          <span>{EVENT_DATES.MARSEILLE_FR}</span>
        </div>
      </div>
    </div>,
    {
      width: 1080,
      height: 1080,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        // P5.x.12.bis : no-store -> uploads de logo visibles immediatement.
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
