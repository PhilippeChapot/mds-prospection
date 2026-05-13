/**
 * GET /api/badge/[companyId]/invitation.png — P5.x.16.
 *
 * Genere un carton d'invitation 1200x800 (paysage 3:2, optimise email)
 * via next/og (Satori). L'exposant l'envoie par email/WhatsApp/SMS a
 * ses propres clients pour les inviter aux MediaDays Solutions 2026.
 *
 * Format paysage : ratio 3:2 s'affiche bien dans le corps d'un Gmail/
 * Outlook sans scroll, contrairement au 1:1 (badge social) ou 9:16
 * (story IG) qui sont trop verticaux pour l'email.
 *
 * Layout 3 zones :
 *   - Zone 1 (1200x320)  : bandeau blanc avec logo exposant contained
 *     (1120x260 max, padding 40) ou fallback nom societe (base 72px).
 *   - Zone 2 (1200x380)  : gradient bleu MDS, "<Societe>" gros titre,
 *     "vous invite aux" sous-titre, logos events 220x220 (MDS + PRS si
 *     prs_exhibitor), URL invitation a copier dans l'email.
 *   - Zone 3 (1200x100)  : bandeau blanc avec dates Paris/Marseille
 *     sur une ligne en bleu MDS.
 *
 * URL invitation : `mediadays.solutions/i/<company.id>` (UUID complet,
 * 36 chars). Pas de colonne slug sur companies -- l'UUID est deja
 * unique et unguessable, on evite une migration supplementaire.
 *
 * Reutilise les helpers src/lib/social-assets/ (cf P5.x.14).
 *
 * Public : pas d'auth (l'exposant partage l'URL).
 * Logs : prefix [api/invitation].
 */

import { ImageResponse } from 'next/og';
import {
  BRAND_COLORS,
  EVENT_DATES,
  adaptiveFontSize,
  fetchLogoAsDataUrl,
  getEventLogos,
  slugify,
} from '@/lib/social-assets';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[api/invitation]';

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

  const logoDataUrl = await fetchLogoAsDataUrl(company.logo_url);

  // URL d'invitation a afficher dans le visuel (sans https:// pour
  // gagner de la place, l'exposant complete son email avec le lien
  // complet a cote du bouton). On garde le domaine pour qu'un destinataire
  // qui prend juste le PNG sache ou aller.
  const inviteUrl = `mediadays.solutions/i/${company.id}`;

  console.log(
    '%s render company=%s name=%s isPrs=%s hasLogoUrl=%s embedded=%s',
    LOG_PREFIX,
    company.id,
    company.name,
    isPrs,
    Boolean(company.logo_url),
    Boolean(logoDataUrl),
  );

  const fallbackFontSize = adaptiveFontSize(company.name, 72);
  const filename = `invitation-mds-2026-${slugify(company.name)}.png`;

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
      {/* ZONE 1 — bandeau blanc 1200x320 : logo exposant ou fallback nom */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 320,
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
            style={{ maxWidth: 1120, maxHeight: 260, objectFit: 'contain' }}
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
              maxWidth: 1120,
            }}
          >
            {company.name}
          </div>
        )}
      </div>

      {/* ZONE 2 — gradient bleu 1200x380 : nom societe + "vous invite aux" + logos + URL */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          background: BRAND_COLORS.GRADIENT_BLUE,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          gap: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 48,
            color: BRAND_COLORS.WHITE,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.1,
            maxWidth: 1100,
          }}
        >
          {company.name}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 32,
            color: BRAND_COLORS.WHITE_90,
            textAlign: 'center',
          }}
        >
          vous invite aux
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoMdsUrl} alt="" width={220} height={220} />
          {isPrs ? (
            <>
              <div
                style={{
                  display: 'flex',
                  color: BRAND_COLORS.WHITE_40,
                  fontSize: 100,
                  lineHeight: 1,
                }}
              >
                |
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoPrsUrl} alt="" width={220} height={220} />
            </>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 28,
            color: BRAND_COLORS.WHITE,
            fontWeight: 600,
          }}
        >
          {inviteUrl}
        </div>
      </div>

      {/* ZONE 3 — bandeau blanc 1200x100 : dates Paris · Marseille en bleu MDS */}
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
            fontSize: 26,
            color: BRAND_COLORS.MDS_BLUE,
            fontWeight: 600,
          }}
        >
          <span>{EVENT_DATES.PARIS_FR}</span>
          <span style={{ color: BRAND_COLORS.BLUE_FADED, margin: '0 20px' }}>·</span>
          <span>{EVENT_DATES.MARSEILLE_FR}</span>
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 800,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
