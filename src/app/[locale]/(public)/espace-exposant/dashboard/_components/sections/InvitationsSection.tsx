/**
 * P5.x.17 — section "Mes invitations" de l'Espace Exposant V1.3.
 *
 * Regroupe P5.x.16 + P5.x.16-bis :
 *   - Download invitation PNG 1200x800
 *   - URL slug a copier (avec InvitationLinkCopyButton)
 *   - Edition slug inline (SlugEditor)
 *   - Compteur de clicks (proxy d'engagement)
 */

import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InvitationLinkCopyButton } from '../../InvitationLinkCopyButton';
import { SlugEditor } from '../../SlugEditor';
import { NoLogoBanner } from '../NoLogoBanner';
import type { SectionProps } from './types';

export async function InvitationsSection({ data, locale }: SectionProps) {
  const t = await getTranslations({ locale, namespace: 'espaceExposant.dashboard' });
  const tBanner = await getTranslations({ locale, namespace: 'espaceExposant.noLogoBanner' });
  const hasLogo = !!data.company.logoUrl;

  // Prefere le slug court (P5.x.16-bis), fallback UUID si migration 0038
  // pas encore appliquee.
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
  const identifier = data.company.slug ?? data.company.id;
  const inviteUrl = `${appOrigin}/i/${identifier}`;
  const clicks = data.inviteClicks;
  const statsKey =
    clicks === 0
      ? 'invitation.statsZero'
      : clicks === 1
        ? 'invitation.statsOne'
        : 'invitation.statsMany';

  return (
    <div className="space-y-5">
      {/* P5.x.18 — banner conseil si pas de logo. Pointe vers l'ancre
          du LogoUploader dans la section Kit communication. */}
      {!hasLogo && (
        <NoLogoBanner
          title={tBanner('title')}
          description={tBanner('description')}
          ctaLabel={tBanner('cta')}
          uploadHref={`/${locale}/espace-exposant/dashboard/kit-communication#logo-uploader`}
        />
      )}

      <Card className="border-md-border space-y-4 p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-md-text text-base font-semibold">{t('invitation.section')}</h2>
          <p className="text-md-text-muted mt-1 text-sm">{t('invitation.intro')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="bg-md-magenta hover:bg-md-magenta-soft">
            <a href={`/api/badge/${data.company.id}/invitation.png`} download>
              {t('invitation.download')} ↓
            </a>
          </Button>
          {!data.company.logoUrl ? (
            <span className="text-md-text-muted text-xs italic">{t('invitation.tipNoLogo')}</span>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-md-text-muted text-xs font-medium">
            {t('invitation.linkLabel')}
          </label>
          <div className="border-md-border bg-md-bg-soft flex flex-wrap items-center gap-2 rounded-md border p-2">
            <code className="text-md-text grow font-mono text-xs break-all">{inviteUrl}</code>
            <InvitationLinkCopyButton text={inviteUrl} />
          </div>
          <div className="pt-1">
            <SlugEditor initialSlug={data.company.slug} appOrigin={appOrigin} />
          </div>
        </div>

        <div className="border-md-border flex items-baseline gap-2 border-t pt-3">
          <span className="text-md-blue text-2xl font-extrabold">{clicks}</span>
          <span className="text-md-text-muted text-sm">
            {clicks === 0 ? t('invitation.statsZero') : t(statsKey, { count: clicks })}
          </span>
        </div>
      </Card>
    </div>
  );
}
