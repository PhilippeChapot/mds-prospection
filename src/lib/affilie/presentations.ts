/**
 * P7.x.AffiliateCanvaPresentations — config statique des présentations
 * commerciales Canva mises à disposition des affiliés.
 *
 * Source unique : importée par AffiliatePresentationsSection (server
 * component, pas de 'use client' — pas d'handlers sur les liens).
 *
 * Liens hardcodés délibérément : les URLs Canva changent rarement et
 * sont pilotées par Phil. Une migration n'apporte rien ici.
 */

export type PresentationLocale = 'fr' | 'en';

export interface PresentationItem {
  id: string;
  title: string;
  description: string;
  url: string;
  icon: string;
}

const PRESENTATIONS_FR: readonly PresentationItem[] = [
  {
    id: 'fr-with-rates',
    title: 'MediaDays Solutions (avec tarifs)',
    description: 'Présentation complète idéale pour les décideurs',
    url: 'https://canva.link/mdsolutions',
    icon: '📊',
  },
  {
    id: 'fr-without-rates',
    title: 'MediaDays Solutions (sans tarifs)',
    description: 'Version douce pour démarchage discret ou première approche',
    url: 'https://canva.link/29m0ohjwcpmo15b',
    icon: '📊',
  },
] as const;

const PRESENTATIONS_EN: readonly PresentationItem[] = [
  {
    id: 'en-with-rates',
    title: 'MediaDays Solutions (with rates)',
    description: 'Full deck for decision makers',
    url: 'https://canva.link/5wcsz8cc4muq5e5',
    icon: '📊',
  },
  {
    id: 'en-without-rates',
    title: 'MediaDays Solutions (without rates)',
    description: 'Soft version for first approach or discreet outreach',
    url: 'https://canva.link/c5uqrizp8gyd4v2',
    icon: '📊',
  },
] as const;

const PRESENTATIONS_COMMON: readonly PresentationItem[] = [
  {
    id: 'common-floor-plans',
    title: 'Plans des salons / Venue floor plans',
    description:
      'Plans complets — Marseille, Bruxelles, Paris / Full floor plans — Marseille, Brussels, Paris',
    url: 'https://canva.link/fs18tpx5jkotm3f',
    icon: '🗺️',
  },
] as const;

/** Retourne les présentations à afficher pour la locale donnée :
 *  cards locale-spécifiques + carte commune. */
export function getPresentations(locale: PresentationLocale): PresentationItem[] {
  const localeCards = locale === 'en' ? PRESENTATIONS_EN : PRESENTATIONS_FR;
  return [...localeCards, ...PRESENTATIONS_COMMON];
}

export const PRESENTATIONS_SECTION_TITLE: Record<PresentationLocale, string> = {
  fr: '📊 Présentations commerciales',
  en: '📊 Sales presentations',
};

export const PRESENTATIONS_CTA_LABEL: Record<PresentationLocale, string> = {
  fr: 'Voir le Canva ↗',
  en: 'Open Canva ↗',
};
