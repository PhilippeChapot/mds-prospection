import { cn } from '@/lib/utils';

/**
 * Affichage contextuel du logo selon la categorie tarifaire — SPEC §3.31.
 *
 *   prs_exhibitor → uniquement logo PRS
 *   standard      → uniquement logo MDS
 *   non_eligible  → les deux logos (fallback)
 *   admin         → les deux logos (vue editoriale)
 *   undefined     → les deux logos (anonyme avant identification)
 *
 * Ordre fige : MDS gauche / PRS droite. Variantes blanc/bleu selon le fond.
 *
 * On utilise un <img> plain plutot que next/image : les SVG ne tirent aucun
 * benefice de l'optimisation Next, et un <img> simplifie les tests.
 */

export type BrandCategory = 'prs_exhibitor' | 'standard' | 'non_eligible' | 'admin';
export type LogoTheme = 'light' | 'dark';

interface HeaderLogoProps {
  category?: BrandCategory;
  theme?: LogoTheme;
  className?: string;
  size?: number;
}

function logoSrc(brand: 'MDS' | 'PRS', theme: LogoTheme) {
  if (brand === 'MDS') {
    return theme === 'dark'
      ? '/brand/MDSLogo_final_blanc_ligne.svg'
      : '/brand/MDSLogo_final_bleu_ligne.svg';
  }
  const variant = theme === 'dark' ? 'Blanc' : 'Bleu';
  return `/brand/PRS-Logo${variant}2026.svg`;
}

export function HeaderLogo({ category, theme = 'dark', className, size = 44 }: HeaderLogoProps) {
  const showMDS = category !== 'prs_exhibitor';
  const showPRS = category !== 'standard';

  return (
    <div className={cn('flex items-center gap-3', className)} data-testid="header-logo">
      {showMDS && (
        // eslint-disable-next-line @next/next/no-img-element -- SVG, pas de gain via next/image
        <img
          src={logoSrc('MDS', theme)}
          alt="MediaDays Solutions 2026"
          data-testid="header-logo-mds"
          style={{ height: size, width: 'auto' }}
        />
      )}
      {showMDS && showPRS && (
        <span
          data-testid="header-logo-divider"
          className="h-8 w-px"
          style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)' }}
          aria-hidden
        />
      )}
      {showPRS && (
        // eslint-disable-next-line @next/next/no-img-element -- SVG, pas de gain via next/image
        <img
          src={logoSrc('PRS', theme)}
          alt="Paris Radio Show 2026"
          data-testid="header-logo-prs"
          style={{ height: size, width: 'auto' }}
        />
      )}
    </div>
  );
}
