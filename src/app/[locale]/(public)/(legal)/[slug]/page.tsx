import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { LEGAL_SLUGS, loadLegalPage, type LegalSlug } from '@/lib/legal/load';
import { routing, type AppLocale } from '@/i18n/routing';
import './prose.css';
import type { Locale } from 'next-intl';

interface PageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

/**
 * Pre-genere les 3 pages legales x 2 locales = 6 routes statiques.
 * Slug = pathname interne (cf. routing.ts), pas le slug localise.
 */
export function generateStaticParams() {
  const params: { locale: AppLocale; slug: LegalSlug }[] = [];
  for (const locale of routing.locales) {
    for (const slug of LEGAL_SLUGS) {
      params.push({ locale, slug });
    }
  }
  return params;
}

export const dynamicParams = false; // 404 sur tout slug non liste

export async function generateMetadata({ params }: PageProps) {
  const { locale, slug } = await params;
  const page = await loadLegalPage(slug as LegalSlug, locale as AppLocale);
  return {
    title: page?.title ?? 'Mentions légales',
  };
}

export default async function LegalPage({ params }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  if (!LEGAL_SLUGS.includes(slug)) {
    notFound();
  }

  const page = await loadLegalPage(slug as LegalSlug, locale as AppLocale);
  if (!page) {
    notFound();
  }

  return <LegalContent page={page} />;
}

function LegalContent({ page }: { page: { title: string; html: string } }) {
  const tNav = useTranslations('publicNav');

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Card className="border-md-border space-y-6 p-6 shadow-sm sm:p-10">
        <header>
          <p className="text-md-text-muted text-xs font-semibold tracking-widest uppercase">
            {tNav('legalSection')}
          </p>
          <h1 className="text-md-text mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
            {page.title}
          </h1>
        </header>
        {/* HTML deja sanitize via DOMPurify dans loadLegalPage. */}
        <article className="legal-prose" dangerouslySetInnerHTML={{ __html: page.html }} />
      </Card>
    </section>
  );
}
