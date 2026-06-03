/**
 * Font-size adaptative pour le fallback nom societe quand un partenaire
 * n'a pas uploade son logo. Empeche un nom long de deborder de la
 * zone dispo.
 *
 * P5.x.14 — extrait depuis /api/badge/[companyId]/badge.png et
 * generalise via parametre `base` pour reutilisation dans la banniere
 * LinkedIn (zone plus petite -> base plus petit).
 *
 * Echelle utilisee :
 *  - <= 10 chars  : base (badge 1080: 88px)
 *  - <= 20 chars  : 73% base
 *  - <= 35 chars  : 50% base
 *  - > 35 chars   : 36% base
 */

export function adaptiveFontSize(name: string, base: number = 88): number {
  const len = name.length;
  if (len <= 10) return base;
  if (len <= 20) return Math.round(base * 0.73);
  if (len <= 35) return Math.round(base * 0.5);
  return Math.round(base * 0.36);
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}
