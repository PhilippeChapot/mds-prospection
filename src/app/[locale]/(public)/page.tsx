import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

const MEDIADAYS_NET_URL = 'https://mediadays.net';
import type { Locale } from 'next-intl';
import { getTaxonomy } from '@/lib/landing/taxonomy';
import { PolesExplorer } from '@/components/landing/PolesExplorer';
import { VisitorFamiliesExplorer } from '@/components/landing/VisitorFamiliesExplorer';
import { InstitutionnelEcoleFormProvider } from '@/components/landing/institutionnel-ecole-form-context';
import { CanvaEmbed } from '@/components/landing/CanvaEmbed';
import { EtapesSection } from '@/components/landing/EtapesSection';

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HomeContent />;
}

function HomeContent() {
  const t = useTranslations('home');
  const tLanding = useTranslations('landing');
  const taxonomy = getTaxonomy();

  return (
    <InstitutionnelEcoleFormProvider>
      {/* Hero */}
      <section
        className="relative overflow-hidden px-6 py-20 text-white sm:py-28"
        style={{
          background:
            'linear-gradient(135deg, rgba(3,26,86,0.94) 0%, rgba(41,66,148,0.94) 100%), radial-gradient(circle at 20% 80%, rgba(230,0,126,0.4), transparent 50%)',
          backgroundColor: 'var(--color-md-blue-dark)',
        }}
      >
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 text-center">
          <div className="space-y-4">
            <p className="text-md-magenta-soft text-sm font-semibold tracking-widest uppercase">
              {t('eyebrow')}
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight text-balance md:text-6xl">
              {t('tagline')}
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-pretty text-white/85 md:text-xl">
              {t('subtitle')}
            </p>
          </div>

          {/* P6.x.4-a-nonies — cards quick-info Marseille/Paris retirees du hero
              (doublon avec la section "Les etapes 2026" plus bas). */}

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Button asChild size="lg" className="bg-md-magenta hover:bg-md-magenta-soft">
              <Link
                href={{ pathname: '/inscription-partenaire', query: { category: 'partenaire' } }}
              >
                {t('ctaExhibitor')}
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <a href={MEDIADAYS_NET_URL} target="_blank" rel="noopener noreferrer">
                {t('ctaVisitor')}
                <ExternalLink className="ml-1.5 h-4 w-4" aria-hidden />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* P6.x.4-a-octies — 3 étapes 2026 (Marseille / Paris / Bruxelles) */}
      <EtapesSection />

      {/* Pôles explorer */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10 text-center">
          <p className="text-md-magenta text-xs font-semibold tracking-widest uppercase">
            {tLanding('polesSection.eyebrow', {
              poles: taxonomy.stats.total_poles,
              sectors: taxonomy.stats.total_sous_secteurs,
              partners: taxonomy.stats.total_partenaires_cibles,
            })}
          </p>
          <h2 className="text-md-blue-dark mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
            🎯 {tLanding('polesSection.title')}
          </h2>
          <p className="text-md-text-muted mx-auto mt-3 max-w-2xl text-base">
            {tLanding('polesSection.subtitle')}
          </p>
        </div>
        <PolesExplorer poles={taxonomy.poles} />
      </section>

      {/* Visiteurs */}
      <section className="bg-md-blue-deep/[0.03] py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 text-center">
            <p className="text-md-magenta text-xs font-semibold tracking-widest uppercase">
              {tLanding('visitorsSection.eyebrow', {
                families: taxonomy.stats.total_visiteurs_families,
                entities: taxonomy.stats.total_visiteurs_entites,
              })}
            </p>
            <h2 className="text-md-blue-dark mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
              👥 {tLanding('visitorsSection.title')}
            </h2>
            <p className="text-md-text-muted mx-auto mt-3 max-w-2xl text-base">
              {tLanding('visitorsSection.subtitle')}
            </p>
          </div>
          <VisitorFamiliesExplorer families={taxonomy.visiteurs} poles={taxonomy.poles} />
        </div>
      </section>

      {/* Reassurance */}
      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h2 className="text-md-text mb-3 text-2xl font-bold md:text-3xl">{t('reassureTitle')}</h2>
        <p className="text-md-text-muted mx-auto max-w-2xl text-base md:text-lg">
          {t('reassureBody')}
        </p>
      </section>

      {/* Canva embed */}
      <CanvaEmbed />
    </InstitutionnelEcoleFormProvider>
  );
}
