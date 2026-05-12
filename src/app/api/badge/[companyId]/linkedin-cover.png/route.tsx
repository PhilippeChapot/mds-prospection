/**
 * GET /api/badge/[companyId]/linkedin-cover.png — P5.x.14.
 *
 * Genere une banniere de profil LinkedIn (1584x396) via next/og (Satori).
 *
 * Layout 2 colonnes :
 *   - Colonne gauche (792x396)  : fond blanc, logo exposant contained
 *     (max 728x332, padding 32). Si pas de logo : nom societe en gros
 *     texte adaptatif (base 64px).
 *   - Colonne droite (792x396)  : gradient bleu MDS avec tagline
 *     "J'EXPOSE AU/AUX", logos events (MDS + PRS si prs_exhibitor,
 *     separes par trait vertical 80px) 160x160, dates Paris/Marseille
 *     sur une ligne, et URL mediadays.net.
 *
 * Reutilise les helpers src/lib/social-assets/ (cf P5.x.14 Phase 0)
 * pour partager couleurs, dates, wording avec le badge social.
 *
 * Public : pas d'auth (l'exposant partage l'URL pour son profil LinkedIn).
 * Logs : prefix [api/linkedin-cover].
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

const LOG_PREFIX = '[api/linkedin-cover]';

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

  // Base 64px : zone gauche utile ~728x332, plus petite que celle du
  // badge (1080x360), donc texte plus modeste pour fit les noms longs.
  const fallbackFontSize = adaptiveFontSize(company.name, 64);
  const filename = `linkedin-cover-mds-2026-${slugify(company.name)}.png`;

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
      {/* COLONNE GAUCHE — 792x396 blanche : logo exposant ou fallback nom */}
      <div
        style={{
          display: 'flex',
          width: 792,
          height: 396,
          background: BRAND_COLORS.WHITE,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
        }}
      >
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDataUrl}
            alt=""
            style={{ maxWidth: 728, maxHeight: 332, objectFit: 'contain' }}
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
              maxWidth: 728,
            }}
          >
            {company.name}
          </div>
        )}
      </div>

      {/* COLONNE DROITE — 792x396 gradient bleu : tagline + logos + dates + URL */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 792,
          height: 396,
          background: BRAND_COLORS.GRADIENT_BLUE,
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 32px',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: BRAND_COLORS.WHITE_90,
            letterSpacing: '0.25em',
            fontWeight: 600,
          }}
        >
          {wording}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoMdsUrl} alt="" width={160} height={160} />
          {isPrs ? (
            <>
              <div
                style={{
                  display: 'flex',
                  width: 2,
                  height: 80,
                  background: BRAND_COLORS.WHITE_40,
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoPrsUrl} alt="" width={160} height={160} />
            </>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 18,
            color: BRAND_COLORS.WHITE_90,
            fontWeight: 600,
          }}
        >
          <span>{EVENT_DATES.PARIS_FR}</span>
          <span
            style={{
              color: BRAND_COLORS.WHITE_40,
              margin: '0 16px',
            }}
          >
            ·
          </span>
          <span>{EVENT_DATES.MARSEILLE_FR}</span>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 20,
            color: BRAND_COLORS.WHITE_70,
            fontWeight: 600,
            marginTop: 4,
          }}
        >
          mediadays.net
        </div>
      </div>
    </div>,
    {
      width: 1584,
      height: 396,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
