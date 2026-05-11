/**
 * GET /api/badge/[companyId]/badge.png — P5.x.12 (+ .bis fixes).
 *
 * Genere un badge social 1080x1080 via next/og (Satori). Le badge
 * differe selon companies.category :
 *   - prs_exhibitor : "J'EXPOSE AU" + logos MDS + Paris Radio Show
 *     separes par un trait vertical, 280x280 chacun
 *   - autres        : "J'EXPOSE AUX" + logo MDS seul 280x280
 *
 * Fallback si la company n'a pas de logo upload : on affiche le nom
 * de la societe en gros texte dans le cercle blanc.
 *
 * P5.x.12.bis :
 *   - Logo exposant prefetch en data URL avant Satori (sinon
 *     next/og ne fetch pas systematiquement les URLs Supabase Storage)
 *   - Wording "J'EXPOSE AU" (PRS, sing. masc.) vs "J'EXPOSE AUX"
 *     (MDS, plur.)
 *   - Logos MDS/PRS bumpees a 280x280 pour equilibre visuel
 *   - Cache `no-store` pour que les uploads se voient immediatement
 *
 * Public : pas d'auth (l'exposant partage l'URL pour social media).
 *
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
  const logoMdsUrl = `${baseUrl}/brand/MDS-LogoBlanc2026-email.png`;
  const logoPrsUrl = `${baseUrl}/brand/PRS-LogoBlanc2026-email.png`;

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

  // Truncate le nom societe pour le fallback (si > ~24 chars, on
  // reduit la font-size pour eviter overflow du cercle 280px).
  const fallbackFontSize = company.name.length > 32 ? 22 : company.name.length > 20 ? 28 : 36;

  const filename = `badge-mds-2026-${slugify(company.name)}.png`;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #294294 0%, #1a3170 100%)',
        padding: '80px 60px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {/* Cercle logo societe / fallback nom */}
      <div
        style={{
          display: 'flex',
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoDataUrl} alt="" width={260} height={260} style={{ objectFit: 'contain' }} />
        ) : (
          <div
            style={{
              display: 'flex',
              fontSize: fallbackFontSize,
              fontWeight: 700,
              color: '#294294',
              textAlign: 'center',
              padding: '0 20px',
              lineHeight: 1.2,
            }}
          >
            {company.name}
          </div>
        )}
      </div>

      {/* Bloc central : tagline + logos events */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 36,
            color: 'rgba(255,255,255,0.92)',
            letterSpacing: '0.25em',
            margin: 0,
            fontWeight: 600,
          }}
        >
          {/* P5.x.12.bis : "AU" pour PRS (Paris Radio Show, sing. masc.),
              "AUX" pour MDS (pluriel). */}
          {isPrs ? "J'EXPOSE AU" : "J'EXPOSE AUX"}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 40,
          }}
        >
          {/* P5.x.12.bis : logos 280x280 (vs 180 V1.2) pour equilibre visuel
              avec le cercle logo expo 320x320 en haut. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoMdsUrl} alt="" width={280} height={280} />
          {isPrs ? (
            <>
              <div
                style={{
                  display: 'flex',
                  width: 2,
                  height: 120,
                  background: 'rgba(255,255,255,0.4)',
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoPrsUrl} alt="" width={280} height={280} />
            </>
          ) : null}
        </div>
      </div>

      {/* Footer dates + URL */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, color: '#fff' }}>Paris · 15 décembre</div>
        <div style={{ display: 'flex', fontSize: 28, color: '#fff' }}>Marseille · 10 décembre</div>
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: 'rgba(255,255,255,0.7)',
            marginTop: 16,
          }}
        >
          mediadays.solutions
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
