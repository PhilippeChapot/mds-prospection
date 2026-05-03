import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { Step1Form } from './Step1Form';
import type { Locale } from 'next-intl';
import type { SignupCategory } from '@/lib/signup/schema';

export const metadata = {
  title: 'Inscription',
};

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ category?: string }>;
}

export default async function ExhibitorRegistrationPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { category } = await searchParams;
  const initialCategory: SignupCategory = category === 'partenaire' ? 'partenaire' : 'exposant';
  return <Content locale={locale as 'fr' | 'en'} initialCategory={initialCategory} />;
}

function Content({
  locale,
  initialCategory,
}: {
  locale: 'fr' | 'en';
  initialCategory: SignupCategory;
}) {
  const t = useTranslations('signup.step1');

  return (
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-8 text-center">
        <p className="text-md-magenta mb-2 text-xs font-semibold tracking-widest uppercase">
          1 / 2
        </p>
        <h1 className="text-md-text mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">
          {t('heading')}
        </h1>
        <p className="text-md-text-muted mx-auto max-w-xl text-base">{t('subheading')}</p>
      </div>

      <Step1Form locale={locale} initialCategory={initialCategory} />
    </section>
  );
}
