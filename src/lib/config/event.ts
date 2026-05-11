/**
 * Configuration MDS 2026 — dates events + objectif revenue.
 *
 * Toutes les valeurs ont un fallback hardcode pour ne pas casser le build
 * si une env var manque cote dev/preview. En prod Phil peut surcharger
 * via Vercel.
 */

const PARIS_FALLBACK = '2026-12-15';
const MARSEILLE_FALLBACK = '2026-12-10';
const REVENUE_TARGET_FALLBACK = 350_000;

export function getEventDateParis(): Date {
  return parseIso(process.env.EVENT_DATE_PARIS, PARIS_FALLBACK);
}

export function getEventDateMarseille(): Date {
  return parseIso(process.env.EVENT_DATE_MARSEILLE, MARSEILLE_FALLBACK);
}

/**
 * Objectif chiffre d'affaires TTC pour MDS 2026 — affiche en marker
 * sur le chart "Revenue cumule" du dashboard.
 */
export function getMdsRevenueTarget2026(): number {
  const raw = process.env.MDS_REVENUE_TARGET_2026;
  if (!raw) return REVENUE_TARGET_FALLBACK;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : REVENUE_TARGET_FALLBACK;
}

/**
 * Retourne la date event la plus proche (le minimum). Utilise pour
 * l'alerte "stand non attribue a T-30j".
 */
export function getNextEventDate(): Date {
  const paris = getEventDateParis();
  const marseille = getEventDateMarseille();
  return paris.getTime() < marseille.getTime() ? paris : marseille;
}

function parseIso(raw: string | undefined, fallback: string): Date {
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(fallback);
}
