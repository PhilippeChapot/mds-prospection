/**
 * Section Tracking links — Espace Affilie — P7.x.1.B
 *
 * Affiche 4 liens copiables (landing FR/EN + signup wizard FR/EN) avec
 * le token affilie injecte en `?ref=`. Click sur "Copier" -> navigator.
 * clipboard + toast.
 *
 * Le code partenaire (token) est aussi affiche en haut pour rappel.
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireAffilieSession } from '@/lib/affilie/session';
import { loadAffilieDashboardData, buildTrackingLinks } from '@/lib/affilie/dashboard-data';
import { Card } from '@/components/ui/card';
import { CopyLinkButton } from './CopyLinkButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Liens tracking · Affilié MDS 2026' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function AffilieTrackingPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { affiliateId } = await requireAffilieSession(locale);
  const t = await getTranslations({ locale, namespace: 'espaceAffilie.dashboard.tracking' });

  const { profile } = await loadAffilieDashboardData(affiliateId);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
  const links = buildTrackingLinks(baseUrl, profile.token);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-md-text text-xl font-bold tracking-tight">{t('title')}</h2>
        <p className="text-md-text-muted mt-1 text-sm">{t('subtitle')}</p>
      </header>

      <Card className="border-md-border bg-md-bg-soft p-4 shadow-none">
        <p className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
          {t('code')}
        </p>
        <p className="text-md-blue-dark mt-1 font-mono text-lg font-extrabold">{profile.token}</p>
      </Card>

      <div className="space-y-3">
        {links.map((link) => (
          <Card key={link.id} className="border-md-border p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-md-text text-sm font-semibold">{t(`labels.${link.labelKey}`)}</p>
                <code className="text-md-text-muted block truncate font-mono text-xs">
                  {link.url}
                </code>
              </div>
              <CopyLinkButton url={link.url} labelCopy={t('copy')} labelCopied={t('copied')} />
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
