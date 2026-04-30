import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { HeaderLogo } from '@/components/brand/HeaderLogo';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { Locale } from 'next-intl';

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <HomeContent locale={locale} />;
}

function HomeContent({ locale }: { locale: string }) {
  const t = useTranslations('home');
  const tNav = useTranslations('nav');

  return (
    <main className="relative flex min-h-screen flex-col">
      {/* Hero — placeholder M2 (la vraie page d'accueil avec video PRS+MDS arrive en P3) */}
      <section
        className="relative flex flex-1 items-center justify-center px-6 py-24 text-white"
        style={{
          background:
            'linear-gradient(135deg, rgba(3,26,86,0.92) 0%, rgba(41,66,148,0.92) 100%), radial-gradient(circle at 20% 80%, rgba(230,0,126,0.4), transparent 50%)',
          backgroundColor: 'var(--color-md-blue-dark)',
        }}
      >
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center">
          <HeaderLogo theme="dark" size={56} />
          <div className="space-y-3">
            <h1 className="text-4xl font-extrabold tracking-tight text-balance md:text-6xl">
              {t('tagline')}
            </h1>
            <p className="text-lg text-pretty text-white/85 md:text-xl">{t('subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-md-magenta hover:bg-md-magenta-soft">
              <Link href={`/${locale}/inscription-exposant`}>{t('ctaPartner')}</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href={`/${locale}/espace-partenaire`}>{t('ctaLogin')}</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-md-border text-md-text-muted border-t bg-white px-6 py-4 text-center text-xs">
        <p>
          {tNav('home')} · MediaDays Solutions 2026 · Editions HF ·{' '}
          <Link href={`/${locale}/styleguide`} className="hover:text-md-blue underline">
            {tNav('styleguide')}
          </Link>
        </p>
      </footer>
    </main>
  );
}
