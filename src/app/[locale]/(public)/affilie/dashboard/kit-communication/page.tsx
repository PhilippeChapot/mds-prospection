/**
 * Section Kit communication — Espace Affilie — P7.x.1.C
 *
 * 3 assets a destination des affilies :
 *   1. Banniere LinkedIn 1200x627 (OG image generee par /api/affilie/kit/
 *      banner-linkedin/[token].png) — telechargement direct
 *   2. Signature email HTML — snippet inline copiable
 *   3. Copy email templates FR + EN — textes copiables
 *
 * Story Instagram et autres formats sont laisses pour V2.
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireAffilieSession } from '@/lib/affilie/session';
import { loadAffilieDashboardData } from '@/lib/affilie/dashboard-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { CopySnippetButton } from './CopySnippetButton';
import { buildEmailSignatureHtml, buildEmailCopy } from './snippets';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kit communication · Affilié MDS 2026' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function AffilieKitCommPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { affiliateId } = await requireAffilieSession(locale);
  const t = await getTranslations({ locale, namespace: 'espaceAffilie.dashboard.kit' });

  const { profile } = await loadAffilieDashboardData(affiliateId);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';

  const trackingFr = `${baseUrl}/fr?ref=${encodeURIComponent(profile.token)}`;
  const bannerUrl = `/api/affilie/kit/banner-linkedin.png`;

  const signatureHtml = buildEmailSignatureHtml({
    affilieName: profile.displayName,
    trackingUrl: trackingFr,
  });
  const copyFr = buildEmailCopy('fr', { trackingUrl: trackingFr });
  const copyEn = buildEmailCopy('en', { trackingUrl: trackingFr });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-md-text text-xl font-bold tracking-tight">{t('title')}</h2>
        <p className="text-md-text-muted mt-1 text-sm">{t('subtitle')}</p>
      </header>

      {/* Banniere LinkedIn */}
      <Card className="border-md-border bg-card space-y-3 p-5 shadow-sm sm:p-6">
        <div>
          <h3 className="text-md-text text-base font-semibold">{t('banner.title')}</h3>
          <p className="text-md-text-muted text-xs">{t('banner.help')}</p>
        </div>
        <div className="border-md-border overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt="Bannière LinkedIn personnalisée"
            className="block h-auto w-full"
          />
        </div>
        <Button asChild className="bg-md-magenta hover:bg-md-magenta-soft">
          <a
            href={bannerUrl}
            download={`mds-affilie-${profile.token}-linkedin.png`}
            aria-label={t('banner.download')}
          >
            <Download className="mr-2 size-4" aria-hidden /> {t('banner.download')}
          </a>
        </Button>
      </Card>

      {/* Signature email HTML */}
      <Card className="border-md-border bg-card space-y-3 p-5 shadow-sm sm:p-6">
        <div>
          <h3 className="text-md-text text-base font-semibold">{t('signature.title')}</h3>
          <p className="text-md-text-muted text-xs">{t('signature.help')}</p>
        </div>
        <div
          className="border-md-border rounded-md border bg-white p-3"
          // Snippet HTML genere cote serveur, sans input utilisateur exotique
          // (display_name est valide a la creation admin). Pas de risque XSS.
          dangerouslySetInnerHTML={{ __html: signatureHtml }}
        />
        <CopySnippetButton
          value={signatureHtml}
          labelCopy={t('copyHtml')}
          labelCopied={t('copied')}
        />
      </Card>

      {/* Copy email FR */}
      <Card className="border-md-border bg-card space-y-3 p-5 shadow-sm sm:p-6">
        <div>
          <h3 className="text-md-text text-base font-semibold">{t('emailFr.title')}</h3>
          <p className="text-md-text-muted text-xs">{t('emailFr.help')}</p>
        </div>
        <pre className="border-md-border rounded-md border bg-white p-3 font-mono text-xs whitespace-pre-wrap">
          {copyFr}
        </pre>
        <CopySnippetButton value={copyFr} labelCopy={t('copyText')} labelCopied={t('copied')} />
      </Card>

      {/* Copy email EN */}
      <Card className="border-md-border bg-card space-y-3 p-5 shadow-sm sm:p-6">
        <div>
          <h3 className="text-md-text text-base font-semibold">{t('emailEn.title')}</h3>
          <p className="text-md-text-muted text-xs">{t('emailEn.help')}</p>
        </div>
        <pre className="border-md-border rounded-md border bg-white p-3 font-mono text-xs whitespace-pre-wrap">
          {copyEn}
        </pre>
        <CopySnippetButton value={copyEn} labelCopy={t('copyText')} labelCopied={t('copied')} />
      </Card>
    </section>
  );
}
