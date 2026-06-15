import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { VisitorResetPasswordForm } from './VisitorResetPasswordForm';

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
        ? 'Reset password · Visitor portal'
        : 'Réinitialiser le mot de passe · Espace Visiteur',
  };
}

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function VisitorResetPasswordPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;
  const safeLocale: 'fr' | 'en' = locale === 'en' ? 'en' : 'fr';
  const t = await getTranslations({ locale, namespace: 'espaceVisiteur.resetPassword' });

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

      {!token ? (
        <div
          role="alert"
          className="border-md-warning/40 bg-md-warning/10 text-md-text flex flex-col gap-3 rounded-md border p-5"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="text-md-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="text-sm">
              {safeLocale === 'en'
                ? 'Missing or invalid reset token.'
                : 'Token de réinitialisation manquant ou invalide.'}
            </span>
          </div>
          <Link
            href="/espace-visiteur/mot-de-passe-oublie"
            className="text-md-blue text-sm hover:underline"
          >
            {safeLocale === 'en' ? '← Request a new reset link' : '← Demander un nouveau lien'}
          </Link>
        </div>
      ) : (
        <VisitorResetPasswordForm token={token} />
      )}
    </section>
  );
}
