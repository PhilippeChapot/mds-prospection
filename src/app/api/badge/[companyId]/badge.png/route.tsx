/**
 * GET /api/badge/[companyId]/badge.png — P5.x.12 (+ .bis + .ter).
 *
 * Genere un badge social 1080x1080 via next/og (Satori).
 *
 * Layout P5.x.12.ter (bandeau logo plein largeur) :
 *   - Haut (1080x360) : bandeau blanc avec logo exposant contained
 *     (1000x280 max, padding 40px). Si pas de logo : nom societe en
 *     gros texte adaptatif (88/64/44/32 px selon longueur).
 *   - Bas (1080x720)  : fond bleu degrade, tagline "J'EXPOSE AU/AUX"
 *     + logos MDS (+ PRS si prs_exhibitor, separes par trait vertical),
 *     dates events, URL.
 *
 * Doctrine .ter : object-fit: contain dans le bandeau garantit qu'un
 * logo "wordmark" rectangulaire (3:1, 4:1) prend toute la largeur
 * disponible au lieu d'etre contraint dans un cercle 320x320.
 *
 * Doctrine .bis (heritee) :
 *   - Logo exposant prefetch en data URL avant Satori (sinon
 *     next/og ne fetch pas systematiquement les URLs Supabase Storage)
 *   - Wording "J'EXPOSE AU" (PRS, sing. masc.) vs "J'EXPOSE AUX"
 *     (MDS, plur.)
 *   - Logos MDS/PRS 280x280
 *   - Cache `no-store` pour que les uploads se voient immediatement
 *
 * Public : pas d'auth (l'exposant partage l'URL pour social media).
 * Logs : prefix [api/badge].
 */

import { ImageResponse } from 'next/og';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[api/badge]';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ companyId: string }>;
}

export async function GET(req: Request, { params }: RouteParams): Promise<Response> {
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

  const isPrs = company.category === 'prs_exhibitor';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  // P5.x.12.septies : nouveaux PNG 1600x1600 (4x DPI) pour rendu net
  // a 400x400 dans le badge social.
  const logoMdsUrl = `${baseUrl}/brand/MDS-LogoBlanc-badge.png`;
  const logoPrsUrl = `${baseUrl}/brand/PRS-LogoBlanc-badge.png`;

  // P5.x.12.bis Bug 1 : prefetch le logo en data URL avant Satori.
  // next/og (Satori) ne fetch pas systematiquement les URLs externes
  // (notamment Supabase Storage), donc on resout cote serveur pour
  // garantir l'embedding dans le PNG genere. Fallback null sur erreur
  // -> on tombe sur l'affichage nom societe.
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

  // P5.x.12.ter : font-size adaptative pour le fallback nom societe
  // (zone blanche 1080x360, padding 40px -> 1000x280 utiles).
  const fallbackFontSize = adaptiveFontSize(company.name);
  const filename = `badge-mds-2026-${slugify(company.name)}.png`;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #294294 0%, #1a3170 100%)',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {/* P5.x.12.ter — HAUT : bandeau blanc plein largeur 1080x360.
          Logo expo contained dans 1000x280 (peu importe le ratio source).
          Fallback : nom societe en gros texte adaptatif. */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 360,
          background: '#FFFFFF',
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
            style={{
              maxWidth: 1000,
              maxHeight: 280,
              objectFit: 'contain',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              fontSize: fallbackFontSize,
              fontWeight: 700,
              color: '#294294',
              textAlign: 'center',
              lineHeight: 1.1,
              maxWidth: 1000,
            }}
          >
            {company.name}
          </div>
        )}
      </div>

      {/* P5.x.12.ter — BAS : zone bleue 1080x720 (flex:1).
          Tagline + logos events centres, dates + URL en bas. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '60px 60px 80px',
        }}
      >
        {/* Tagline + logos events */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 32,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 40,
              color: 'rgba(255,255,255,0.92)',
              letterSpacing: '0.3em',
              margin: 0,
              fontWeight: 600,
            }}
          >
            {/* P5.x.12.bis : "AU" pour PRS (sing. masc.), "AUX" pour MDS (pluriel). */}
            {isPrs ? "J'EXPOSE AU" : "J'EXPOSE AUX"}
          </div>

          {/* P5.x.12.sexies : logos 400x400 (vs 280) pour impact visuel
              fort sur le badge social. Trait separateur 160px en hauteur. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 60,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoMdsUrl} alt="" width={400} height={400} />
            {isPrs ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    width: 2,
                    height: 160,
                    background: 'rgba(255,255,255,0.4)',
                  }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPrsUrl} alt="" width={400} height={400} />
              </>
            ) : null}
          </div>
        </div>

        {/* P5.x.12.sexies — Footer : dates sur une seule ligne + URL visiteur. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: 32,
              color: '#fff',
            }}
          >
            <span>Paris · 15 décembre</span>
            <span
              style={{
                color: 'rgba(255,255,255,0.5)',
                margin: '0 24px',
              }}
            >
              ·
            </span>
            <span>Marseille · 10 décembre</span>
          </div>
          {/* P5.x.12.sexies : URL B2C visiteurs (mediadays.net), pas
              mediadays.solutions qui est le site exposants. Coherent
              avec doctrine signatures email P5.x.10.ter. */}
          <div
            style={{
              display: 'flex',
              fontSize: 40,
              color: 'rgba(255,255,255,0.95)',
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
      width: 1080,
      height: 1080,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        // P5.x.12.bis : no-store -> les uploads de logo se voient
        // immediatement sans hard-refresh navigateur. Cout : pas de
        // cache CDN, mais le badge est genere uniquement a la
        // demande de l'exposant (volume tres faible).
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}

/**
 * Choisit une font-size pour le fallback nom societe (zone 1000x280
 * utiles dans le bandeau blanc). Adaptive selon longueur — empeche
 * un nom long de deborder de la zone.
 */
function adaptiveFontSize(name: string): number {
  const len = name.length;
  if (len <= 10) return 88;
  if (len <= 20) return 64;
  if (len <= 35) return 44;
  return 32;
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Fetch un logo distant et l'encode en data URL pour l'embedder
 * directement dans le PNG genere par next/og. Satori a parfois du
 * mal a fetch les URLs Supabase Storage en runtime ; le prefetch
 * server-side garantit le rendu.
 *
 * Best-effort : si la fetch echoue, retourne null -> le caller
 * tombe sur l'affichage "nom societe" en gros texte (acceptable).
 */
async function fetchLogoAsDataUrl(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl, { cache: 'no-store' });
    if (!res.ok) {
      console.warn('%s fetch-logo-failed status=%d url=%s', LOG_PREFIX, res.status, logoUrl);
      return null;
    }
    const buf = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') ?? 'image/png';
    const base64 = Buffer.from(buf).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error(
      '%s fetch-logo-error url=%s msg=%s',
      LOG_PREFIX,
      logoUrl,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
