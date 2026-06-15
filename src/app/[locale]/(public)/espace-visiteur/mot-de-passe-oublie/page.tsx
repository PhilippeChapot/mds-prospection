import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { VisitorForgotPasswordForm } from './VisitorForgotPasswordForm';

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
        ? 'Forgot password · Visitor portal'
        : 'Mot de passe oublié · Espace Visiteur',
  };
}

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function VisitorForgotPasswordPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const safeLocale: 'fr' | 'en' = locale === 'en' ? 'en' : 'fr';
  const t = await getTranslations({ locale, namespace: 'espaceVisiteur.forgotPassword' });

  return (
    <section className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-8 text-center">
        <p className="text-md-magenta mb-2 text-xs font-semibold tracking-widest uppercase">
          {safeLocale === 'en' ? 'Visitor portal' : 'Espace Visiteur'}
        </p>
        <h1 className="text-md-text mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">
          {t('heading')}
        </h1>
        <p className="text-md-text-muted mx-auto max-w-md text-base">{t('subheading')}</p>
      </div>

      <VisitorForgotPasswordForm locale={safeLocale} />
    </section>
  );
}
