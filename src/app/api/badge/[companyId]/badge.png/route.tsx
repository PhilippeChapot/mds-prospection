/**
 * GET /api/badge/[companyId]/badge.png — P5.x.12
 *
 * Genere un badge social 1080x1080 "J'expose chez MDS 2026" via
 * next/og (Satori). Le badge differe selon companies.category :
 *   - prs_exhibitor : logo MDS + logo Paris Radio Show (separes par
 *     un trait vertical), tagline mixte
 *   - autres : logo MDS seul
 *
 * Fallback si la company n'a pas de logo upload : on affiche le nom
 * de la societe en gros texte dans le cercle blanc.
 *
 * Public : pas d'auth (l'exposant partage l'URL pour social media).
 * Cache : `Cache-Control: public, max-age=3600` cote HTTP — l'image
 * change rarement (logo upload).
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
  const logoUrl = company.logo_url;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  const logoMdsUrl = `${baseUrl}/brand/MDS-LogoBlanc2026-email.png`;
  const logoPrsUrl = `${baseUrl}/brand/PRS-LogoBlanc2026-email.png`;

  console.log(
    '%s render company=%s name=%s isPrs=%s hasLogo=%s',
    LOG_PREFIX,
    company.id,
    company.name,
    isPrs,
    Boolean(logoUrl),
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
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" width={260} height={260} style={{ objectFit: 'contain' }} />
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
          J&apos;EXPOSE CHEZ
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 32,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoMdsUrl} alt="" width={180} height={180} />
          {isPrs ? (
            <>
              <div
                style={{
                  display: 'flex',
                  width: 2,
                  height: 80,
                  background: 'rgba(255,255,255,0.4)',
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoPrsUrl} alt="" width={180} height={180} />
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
        'Cache-Control': 'public, max-age=3600',
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
