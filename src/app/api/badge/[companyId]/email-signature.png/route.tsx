/**
 * GET /api/badge/[companyId]/email-signature.png — P5.x.19.
 *
 * Genere une signature email tres compacte (600x120) via next/og (Satori).
 *
 * Layout 2 colonnes (very small format) :
 *   - Colonne gauche (200x120) : fond blanc, logo partenaire contained
 *     (max 160x80, padding 20). Si pas de logo : nom societe en texte
 *     adaptatif (base 22px) en bleu MDS.
 *   - Colonne droite (400x120) : gradient bleu MDS avec tagline
 *     "J'EXPOSE AU/AUX" (12px, letterSpacing 0.2em), logos events
 *     (MDS + PRS si prs_exhibitor, separes par "|" 28px white_40)
 *     50x50, dates Paris+Marseille sur une ligne separees par "·",
 *     et URL mediadays.net (13px semi-bold).
 *
 * Reutilise les helpers src/lib/social-assets/ (cf P5.x.14).
 *
 * Public : pas d'auth (l'partenaire integre l'URL dans sa signature email).
 * Logs : prefix [api/email-signature].
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

const LOG_PREFIX = '[api/email-signature]';

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

  // Zone gauche utile 160x80 -> base petite (22px). Compact format.
  const fallbackFontSize = adaptiveFontSize(company.name, 22);
  const filename = `email-signature-mds-2026-${slugify(company.name)}.png`;

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
      {/* COLONNE GAUCHE — 200x120 blanche : logo partenaire ou fallback nom */}
      <div
        style={{
          display: 'flex',
          width: 200,
          height: 120,
          background: BRAND_COLORS.WHITE,
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
            style={{ maxWidth: 160, maxHeight: 80, objectFit: 'contain' }}
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
              maxWidth: 160,
            }}
          >
            {company.name}
          </div>
        )}
      </div>

      {/* COLONNE DROITE — 400x120 gradient bleu : tagline + logos + dates + URL */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 400,
          height: 120,
          background: BRAND_COLORS.GRADIENT_BLUE,
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 16px',
          gap: 4,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 12,
            color: BRAND_COLORS.WHITE_90,
            letterSpacing: '0.2em',
            fontWeight: 600,
          }}
        >
          {wording}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoMdsUrl} alt="" width={50} height={50} />
          {isPrs ? (
            <>
              <div
                style={{
                  display: 'flex',
                  color: BRAND_COLORS.WHITE_40,
                  fontSize: 28,
                  lineHeight: 1,
                }}
              >
                |
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoPrsUrl} alt="" width={50} height={50} />
            </>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 11,
            color: BRAND_COLORS.WHITE,
            fontWeight: 500,
          }}
        >
          <span>{EVENT_DATES.PARIS_FR}</span>
          <span
            style={{
              color: BRAND_COLORS.WHITE_40,
              margin: '0 8px',
            }}
          >
            ·
          </span>
          <span>{EVENT_DATES.MARSEILLE_FR}</span>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 13,
            color: BRAND_COLORS.WHITE,
            fontWeight: 600,
          }}
        >
          mediadays.net
        </div>
      </div>
    </div>,
    {
      width: 600,
      height: 120,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
