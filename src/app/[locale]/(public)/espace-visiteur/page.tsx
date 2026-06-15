import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { VisitorLoginTabs } from './VisitorLoginTabs';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title:
      locale === 'en'
        ? 'Visitor portal · MediaDays Solutions 2026'
        : 'Espace Visiteur · MediaDays Solutions 2026',
  };
}

type ReboundReason = 'expired' | 'invalid' | 'generic';

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function EspaceVisiteurPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const safeLocale: 'fr' | 'en' = locale === 'en' ? 'en' : 'fr';

  let reboundReason: ReboundReason | null = null;
  if (sp.error === 'expired') reboundReason = 'expired';
  else if (sp.error === 'invalid') reboundReason = 'invalid';
  else if (sp.error) reboundReason = 'generic';

  const t = await getTranslations({ locale, namespace: 'espaceVisiteur' });

  return (
    <section className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-8 text-center">
        <p className="text-md-magenta mb-2 text-xs font-semibold tracking-widest uppercase">
          {t('title')}
        </p>
        <h1 className="text-md-text mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">
          {t('login.heading')}
        </h1>
        <p className="text-md-text-muted mx-auto max-w-md text-base">{t('login.subheading')}</p>
      </div>

      {reboundReason && (
        <div
          role="alert"
          className="border-md-warning/40 bg-md-warning/10 text-md-text mb-6 flex items-start gap-2.5 rounded-md border p-3 text-sm"
        >
          <AlertTriangle className="text-md-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t(`login.${reboundReason}`)}</span>
        </div>
      )}

      <VisitorLoginTabs locale={safeLocale} />
    </section>
  );
}
