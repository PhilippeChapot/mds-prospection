import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Affichage contextuel du logo selon la categorie tarifaire — SPEC §3.31.
 *
 *   prs_exhibitor → uniquement logo PRS
 *   standard      → uniquement logo MDS
 *   non_eligible  → uniquement logo MDS (pas d'eligibilite PRS)
 *   undefined     → les deux logos (avant identification ou cote admin)
 *
 * Ordre fige : MDS gauche / PRS droite. Variantes blanc/bleu selon le fond.
 */

export type BrandCategory = 'prs_exhibitor' | 'standard' | 'non_eligible';
export type LogoTheme = 'light' | 'dark';

interface HeaderLogoProps {
  category?: BrandCategory;
  theme?: LogoTheme;
  className?: string;
  size?: number;
}

function logoSrc(brand: 'MDS' | 'PRS', theme: LogoTheme) {
  const variant = theme === 'dark' ? 'Blanc' : 'Bleu';
  return `/brand/${brand}-Logo${variant}2026.svg`;
}

export function HeaderLogo({ category, theme = 'dark', className, size = 44 }: HeaderLogoProps) {
  const showMDS = category !== 'prs_exhibitor';
  const showPRS = category === 'prs_exhibitor' || category === undefined;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {showMDS && (
        <Image
          src={logoSrc('MDS', theme)}
          alt="MediaDays Solutions 2026"
          width={size * 2.5}
          height={size}
          priority
          className="h-auto w-auto"
          style={{ height: size }}
        />
      )}
      {showMDS && showPRS && (
        <span
          className="h-8 w-px"
          style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)' }}
          aria-hidden
        />
      )}
      {showPRS && (
        <Image
          src={logoSrc('PRS', theme)}
          alt="Paris Radio Show 2026"
          width={size * 2.5}
          height={size}
          priority
          className="h-auto w-auto"
          style={{ height: size }}
        />
      )}
    </div>
  );
}
