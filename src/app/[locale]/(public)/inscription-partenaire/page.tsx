import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Step1Form } from './Step1Form';
import type { Locale } from 'next-intl';
import type { SignupCategory } from '@/lib/signup/schema';

export const metadata = {
  title: 'Inscription',
};

type ReboundReason = 'expired' | 'invalid' | 'notfound' | 'error';

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{
    category?: string;
    expired?: string;
    invalid?: string;
    notfound?: string;
    error?: string;
  }>;
}

export default async function ExhibitorRegistrationPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const initialCategory: SignupCategory = sp.category === 'sponsor' ? 'sponsor' : 'partenaire';

  let reboundReason: ReboundReason | null = null;
  if (sp.expired) reboundReason = 'expired';
  else if (sp.invalid) reboundReason = 'invalid';
  else if (sp.notfound) reboundReason = 'notfound';
  else if (sp.error) reboundReason = 'error';

  return (
    <Content
      locale={locale as 'fr' | 'en'}
      initialCategory={initialCategory}
      reboundReason={reboundReason}
    />
  );
}

function Content({
  locale,
  initialCategory,
  reboundReason,
}: {
  locale: 'fr' | 'en';
  initialCategory: SignupCategory;
  reboundReason: ReboundReason | null;
}) {
  const t = useTranslations('signup.step1');

  return (
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      {reboundReason && <ReboundBanner reason={reboundReason} />}

      <div className="mb-8 text-center">
        <p className="text-md-magenta mb-2 text-xs font-semibold tracking-widest uppercase">
          1 / 2
        </p>
        <h1 className="text-md-text mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">
          {t('heading')}
        </h1>
        <p className="text-md-text-muted mx-auto max-w-xl text-base">{t('subheading')}</p>
      </div>

      <NoScriptWarning />
      <Step1Form locale={locale} initialCategory={initialCategory} />
    </section>
  );
}

function NoScriptWarning() {
  const t = useTranslations('signup.step1.noscript');
  return (
    <noscript>
      <div className="border-md-danger/40 bg-md-danger/10 text-md-text mb-6 rounded-md border p-3 text-sm">
        {t('message')}
      </div>
    </noscript>
  );
}

function ReboundBanner({ reason }: { reason: ReboundReason }) {
  const t = useTranslations('signup.step1.rebound');
  return (
    <div
      role="alert"
      className="border-md-warning/40 bg-md-warning/10 text-md-text mb-6 flex items-start gap-2.5 rounded-md border p-3 text-sm"
    >
      <AlertTriangle className="text-md-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{t(reason)}</span>
    </div>
  );
}
