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
      className="relative w-full overflow-hidden"
      style={{
        backgroundImage: "url('/brand/HEADER_MD_SOLUTIONS.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      aria-label="MediaDays Solutions × Paris Radio Show 2026"
    >
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-6 px-4 py-10 md:min-h-[280px] md:py-14">
        {/* 2 logos ronds blancs côte à côte */}
        <div className="flex items-center gap-8 md:gap-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/PRS-LogoBlanc2026.svg"
            alt="Paris Radio Show 2026"
            data-testid="hero-bandeau-logo-prs"
            className="h-[80px] w-auto md:h-[130px]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/MDSLogo_final_blanc_rond.svg"
            alt="MediaDays Solutions 2026"
            data-testid="hero-bandeau-logo-mds"
            className="h-[80px] w-auto md:h-[130px]"
          />
        </div>

        {/* CTA rose vif */}
        <Button
          asChild
          size="lg"
          className="bg-md-magenta hover:bg-md-magenta-soft rounded-full px-8 text-white shadow-lg"
        >
          <Link href={{ pathname: '/inscription-partenaire', query: { category: 'partenaire' } }}>
            {t('ctaRegister')}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  );
}
