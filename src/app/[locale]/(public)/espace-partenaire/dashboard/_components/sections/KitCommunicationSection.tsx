/**
 * P5.x.17 — section "Kit communication" de l'Espace Partenaire V1.3.
 *
 * Regroupe :
 *   - Upload logo societe (P5.x.12)
 *   - Badge social 1080x1080 (P5.x.12)
 *   - Banniere LinkedIn 1584x396 (P5.x.14)
 *   - Story Instagram 1080x1920 (P5.x.15)
 *   - Bandeau signature email 600x120 (P5.x.19)
 *   - Fond visio Zoom/Teams 1920x1080 (P5.x.19)
 *   - Wall display ecran stand 1920x1080 (P5.x.19)
 *   - Logos events telechargeables (P5.x.10 commKit)
 *   - Signature email avec preview + copy (P5.x.10)
 *
 * Note : la section "invitation visiteur" est dans son propre onglet
 * (InvitationsSection) car c'est un cas d'usage distinct (clic-tracking
 * + slug + compteur) plutot qu'un asset statique.
 */

import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LogoUploader } from '../../LogoUploader';
import { SignatureCopyButton } from '../../SignatureCopyButton';
import { NoLogoBanner } from '../NoLogoBanner';
import type { SectionProps } from './types';

export async function KitCommunicationSection({ data, locale }: SectionProps) {
  const t = await getTranslations({ locale, namespace: 'espacePartenaire.dashboard' });
  const tBanner = await getTranslations({ locale, namespace: 'espacePartenaire.noLogoBanner' });
  const hasLogo = !!data.company.logoUrl;

  return (
    <div className="space-y-5">
      {/* P5.x.18 — banner conseil si pas de logo. Pointe vers l'ancre
          du LogoUploader plus bas dans la meme section. */}
      {!hasLogo && (
        <NoLogoBanner
          title={tBanner('title')}
          description={tBanner('description')}
          ctaLabel={tBanner('cta')}
          uploadHref={`/${locale}/espace-partenaire/dashboard/kit-communication#logo-uploader`}
        />
      )}

      {/* Logo upload (ancre cible du banner et du lien depuis Mes invitations) */}
      <Card
        id="logo-uploader"
        className="border-md-border scroll-mt-24 space-y-4 p-5 shadow-sm sm:p-6"
      >
        <div>
          <h2 className="text-md-text text-base font-semibold">{t('logoUploader.section')}</h2>
          <p className="text-md-text-muted mt-1 text-sm">{t('logoUploader.intro')}</p>
        </div>
        <LogoUploader currentLogoUrl={data.company.logoUrl} companyName={data.company.name} />
      </Card>

      {/* Badge social */}
      <Card className="border-md-border space-y-3 p-5 shadow-sm sm:p-6">
        <h2 className="text-md-text text-base font-semibold">{t('badge.section')}</h2>
        <p className="text-md-text-muted text-sm">{t('badge.intro')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="bg-md-magenta hover:bg-md-magenta-soft">
            <a href={`/api/badge/${data.company.id}/badge.png`} download>
              {t('badge.download')} ↓
            </a>
          </Button>
          {!data.company.logoUrl ? (
            <span className="text-md-text-muted text-xs italic">{t('badge.tipNoLogo')}</span>
          ) : null}
        </div>
      </Card>

      {/* Banniere LinkedIn */}
      <Card className="border-md-border space-y-3 p-5 shadow-sm sm:p-6">
        <h2 className="text-md-text text-base font-semibold">{t('linkedinCover.section')}</h2>
        <p className="text-md-text-muted text-sm">{t('linkedinCover.intro')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="bg-md-magenta hover:bg-md-magenta-soft">
            <a href={`/api/badge/${data.company.id}/linkedin-cover.png`} download>
              {t('linkedinCover.download')} ↓
            </a>
          </Button>
          {!data.company.logoUrl ? (
            <span className="text-md-text-muted text-xs italic">
              {t('linkedinCover.tipNoLogo')}
            </span>
          ) : null}
        </div>
      </Card>

      {/* Story Instagram */}
      <Card className="border-md-border space-y-3 p-5 shadow-sm sm:p-6">
        <h2 className="text-md-text text-base font-semibold">{t('storyInstagram.section')}</h2>
        <p className="text-md-text-muted text-sm">{t('storyInstagram.intro')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="bg-md-magenta hover:bg-md-magenta-soft">
            <a href={`/api/badge/${data.company.id}/story-instagram.png`} download>
              {t('storyInstagram.download')} ↓
            </a>
          </Button>
          {!data.company.logoUrl ? (
            <span className="text-md-text-muted text-xs italic">
              {t('storyInstagram.tipNoLogo')}
            </span>
          ) : null}
        </div>
      </Card>

      {/* Bandeau signature email (P5.x.19) */}
      <Card className="border-md-border space-y-3 p-5 shadow-sm sm:p-6">
        <h2 className="text-md-text text-base font-semibold">{t('emailSignature.section')}</h2>
        <p className="text-md-text-muted text-sm">{t('emailSignature.intro')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="bg-md-magenta hover:bg-md-magenta-soft">
            <a href={`/api/badge/${data.company.id}/email-signature.png`} download>
              {t('emailSignature.download')} ↓
            </a>
          </Button>
          {!data.company.logoUrl ? (
            <span className="text-md-text-muted text-xs italic">
              {t('emailSignature.tipNoLogo')}
            </span>
          ) : null}
        </div>
      </Card>

      {/* Fond visio Zoom/Teams (P5.x.19) */}
      <Card className="border-md-border space-y-3 p-5 shadow-sm sm:p-6">
        <h2 className="text-md-text text-base font-semibold">{t('zoomBackground.section')}</h2>
        <p className="text-md-text-muted text-sm">{t('zoomBackground.intro')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="bg-md-magenta hover:bg-md-magenta-soft">
            <a href={`/api/badge/${data.company.id}/zoom-background.png`} download>
              {t('zoomBackground.download')} ↓
            </a>
          </Button>
          {!data.company.logoUrl ? (
            <span className="text-md-text-muted text-xs italic">
              {t('zoomBackground.tipNoLogo')}
            </span>
          ) : null}
        </div>
      </Card>

      {/* Wall display ecran stand (P5.x.19) */}
      <Card className="border-md-border space-y-3 p-5 shadow-sm sm:p-6">
        <h2 className="text-md-text text-base font-semibold">{t('wallDisplay.section')}</h2>
        <p className="text-md-text-muted text-sm">{t('wallDisplay.intro')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="bg-md-magenta hover:bg-md-magenta-soft">
            <a href={`/api/badge/${data.company.id}/wall-display.png`} download>
              {t('wallDisplay.download')} ↓
            </a>
          </Button>
          {!data.company.logoUrl ? (
            <span className="text-md-text-muted text-xs italic">{t('wallDisplay.tipNoLogo')}</span>
          ) : null}
        </div>
      </Card>

      {/* Logos events + signature email */}
      <Card className="border-md-border space-y-4 p-5 shadow-sm sm:p-6">
        <h2 className="text-md-text text-base font-semibold">{t('commKit.section')}</h2>
        <p className="text-md-text-muted text-sm">{t('commKit.intro')}</p>

        <div className="space-y-3">
          <LogoRow
            label={t('commKit.logoMds')}
            svgUrl={data.commKit.logoMdsSvgUrl}
            pngUrl={data.commKit.logoMdsPngUrl}
            svgCta={t('commKit.downloadSvg')}
            pngCta={t('commKit.downloadPng')}
          />
          <LogoRow
            label={t('commKit.logoPrs')}
            svgUrl={data.commKit.logoPrsSvgUrl}
            pngUrl={data.commKit.logoPrsPngUrl}
            svgCta={t('commKit.downloadSvg')}
            pngCta={t('commKit.downloadPng')}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-md-text text-sm font-medium">{t('commKit.badge')}</span>
          {data.commKit.badgeJexposeUrl ? (
            <Button asChild variant="outline" size="sm">
              <a
                href={data.commKit.badgeJexposeUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
              >
                {t('commKit.badgeDownload')}
              </a>
            </Button>
          ) : (
            <span className="text-md-text-muted text-xs italic">
              {t('commKit.badgeComingSoon')}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-md-text text-sm font-medium">{t('commKit.signature')}</span>
            <SignatureCopyButton html={data.commKit.emailSignatureHtml} />
          </div>
          <div
            className="border-md-border bg-md-bg-soft overflow-x-auto rounded-md border p-3 text-xs"
            // safe : signature genere cote server, escapeHtml applique.
            dangerouslySetInnerHTML={{ __html: data.commKit.emailSignatureHtml }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-md-text text-sm font-medium">{t('commKit.templates')}</span>
          <span className="text-md-text-muted text-xs italic">
            {t('commKit.templatesComingSoon')}
          </span>
        </div>
      </Card>
    </div>
  );
}

function LogoRow({
  label,
  svgUrl,
  pngUrl,
  svgCta,
  pngCta,
}: {
  label: string;
  svgUrl: string;
  pngUrl: string;
  svgCta: string;
  pngCta: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-md-text font-medium">{label}</span>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={svgUrl} target="_blank" rel="noopener noreferrer" download>
            {svgCta}
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={pngUrl} target="_blank" rel="noopener noreferrer" download>
            {pngCta}
          </a>
        </Button>
      </div>
    </div>
  );
}
