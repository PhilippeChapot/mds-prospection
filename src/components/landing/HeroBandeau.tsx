/**
 * Lot 2 — Section hero bandeau immersif : fond HEADER_MD_SOLUTIONS.png
 * (bleu marine avec dégradés lumineux) + 2 logos ronds blancs + CTA rose.
 *
 * Positionnée au-dessus du hero texte sur la page d'accueil.
 *
 * Logos :
 *   - Gauche : PRS-LogoBlanc2026.svg (Paris Radio Show, variante blanche)
 *   - Droite : MDSLogo_final_blanc_rond.svg (MediaDays Solutions, rond blanc)
 *
 * On utilise <img> plain (pas next/image) : les SVG ne tirent aucun bénéfice
 * de l'optimisation Next, et le PNG de fond est en background CSS — même motif
 * que HeaderLogo.tsx.
 */

import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export function HeroBandeau() {
  const t = useTranslations('publicNav');

  return (
    <section
      data-testid="hero-bandeau"
      className="relative w-full overflow-hidden bg-gradient-to-br from-[#0D1D6D] to-[#1A2A8A]"
      style={{
        backgroundImage: "url('/brand/HEADER_MD_SOLUTIONS.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      aria-label="MediaDays Solutions × Paris Radio Show 2026"
    >
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-8 px-4 py-12 md:min-h-[400px] md:py-16 lg:min-h-[480px]">
        {/* 2 logos ronds blancs côte à côte */}
        <div className="flex items-center gap-10 md:gap-14 lg:gap-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/PRS-LogoBlanc2026.svg"
            alt="Paris Radio Show 2026"
            data-testid="hero-bandeau-logo-prs"
            className="h-[140px] w-[140px] md:h-[200px] md:w-[200px] lg:h-[240px] lg:w-[240px]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/MDSLogo_final_blanc_rond.svg"
            alt="MediaDays Solutions 2026"
            data-testid="hero-bandeau-logo-mds"
            className="h-[140px] w-[140px] md:h-[200px] md:w-[200px] lg:h-[240px] lg:w-[240px]"
          />
        </div>

        {/* CTA rose vif */}
        <Button
          asChild
          size="lg"
          className="bg-md-magenta hover:bg-md-magenta-soft rounded-full px-8 text-lg text-white shadow-lg"
        >
          <Link href={{ pathname: '/inscription-partenaire', query: { category: 'partenaire' } }}>
            {t('ctaRegister')}
            <ArrowRight className="ml-2 h-5 w-5" aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  );
}
