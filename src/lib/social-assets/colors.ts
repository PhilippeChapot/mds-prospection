/**
 * Couleurs brand MDS factorises pour les social assets (badge, banniere
 * LinkedIn, etc.). Source unique de verite — si la charte change,
 * modifier ici et tous les assets generes en heritent.
 *
 * P5.x.14 — extrait depuis /api/badge/[companyId]/badge.png.
 */

export const BRAND_COLORS = {
  /** Bleu MDS principal (#294294) — texte sur fond blanc, headings, etc. */
  MDS_BLUE: '#294294',
  /** Bleu fonce (#1a3170) — fin du gradient bg. */
  MDS_BLUE_DARK: '#1a3170',
  /** Gradient bg standard utilise sur les zones bleues des assets. */
  GRADIENT_BLUE: 'linear-gradient(135deg, #294294 0%, #1a3170 100%)',

  WHITE: '#FFFFFF',
  /** Texte secondaire blanc semi-transparent. */
  WHITE_90: 'rgba(255,255,255,0.92)',
  /** URL, lien sub-line. */
  WHITE_70: 'rgba(255,255,255,0.7)',
  /** Separateur trait vertical entre logos events. */
  WHITE_40: 'rgba(255,255,255,0.4)',

  /** Separateur · entre 2 dates sur fond blanc. */
  BLUE_FADED: 'rgba(41, 66, 148, 0.4)',
} as const;
