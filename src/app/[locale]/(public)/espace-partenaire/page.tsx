import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { PartnerLoginTabs } from './PartnerLoginTabs';
import type { Locale } from 'next-intl';

export const metadata = {
  title: 'Espace Partenaire — MediaDays Solutions 2026',
};

type ReboundReason = 'expired' | 'invalid' | 'generic';

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function EspacePartenairePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  let reboundReason: ReboundReason | null = null;
  if (sp.error === 'expired') reboundReason = 'expired';
  else if (sp.error === 'invalid') reboundReason = 'invalid';
  else if (sp.error) reboundReason = 'generic';

  return <Content locale={locale as 'fr' | 'en'} reboundReason={reboundReason} />;
}

function Content({
  locale,
  reboundReason,
}: {
  locale: 'fr' | 'en';
  reboundReason: ReboundReason | null;
}) {
  const t = useTranslations('espacePartenaire');
  const tForm = useTranslations('espacePartenaire.requestLink');
  const tLogin = useTranslations('espacePartenaire.login');

  return (
    <section className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-8 text-center">
        <p className="text-md-magenta mb-2 text-xs font-semibold tracking-widest uppercase">
          {t('title')}
        </p>
        <h1 className="text-md-text mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">
          {tForm('heading')}
        </h1>
        <p className="text-md-text-muted mx-auto max-w-md text-base">{tForm('subheading')}</p>
      </div>

      {reboundReason && (
        <div
          role="alert"
          className="border-md-warning/40 bg-md-warning/10 text-md-text mb-6 flex items-start gap-2.5 rounded-md border p-3 text-sm"
        >
          <AlertTriangle className="text-md-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{tLogin(reboundReason)}</span>
        </div>
      )}

      <PartnerLoginTabs locale={locale} />
    </section>
  );
}
