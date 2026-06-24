/**
 * P16.x.PreProgrammeTeaser — dictionnaire bilingue de la page (2 locales,
 * standalone → pas de namespace next-intl dédié).
 */

export interface PreProgrammeLabels {
  eyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  datesLieux: string;
  kpiConf: string;
  kpiSpeakers: string;
  kpiPoles: string;
  repartitionTitle: string;
  mdsTrack: string;
  mdsTagline: string;
  prsTrack: string;
  prsTagline: string;
  targetAudience: string;
  teaserNote: string;
  ctaTitle: string;
  ctaSubtitle: string;
  ctaPartner: string;
  ctaContact: string;
  ctaVisit: string;
  confSuffix: string;
}

export const PREPROGRAMME_LABELS: Record<'fr' | 'en', PreProgrammeLabels> = {
  fr: {
    eyebrow: 'Pré-programme confidentiel',
    heroTitle: 'MediaDays Solutions × Paris Radio Show 2026',
    heroSubtitle:
      'Un avant-goût exclusif du programme 2026. Les thématiques sont posées — les intervenants et horaires se dévoilent bientôt.',
    datesLieux: 'Paris · 15 décembre 2026   —   Marseille · 10 décembre 2026',
    kpiConf: 'conférences',
    kpiSpeakers: 'intervenants',
    kpiPoles: 'pôles thématiques',
    repartitionTitle: 'Répartition par pôle',
    mdsTrack: 'MediaDays Solutions',
    mdsTagline: 'Tous les médias, toutes les solutions.',
    prsTrack: 'Paris Radio Show',
    prsTagline: 'Le rendez-vous de la radio et de l’audio.',
    targetAudience: 'Pour qui ?',
    teaserNote: 'Intervenants et horaires dévoilés prochainement.',
    ctaTitle: 'Envie d’en être ?',
    ctaSubtitle: 'Réservez votre place dans le programme 2026.',
    ctaPartner: 'Devenir partenaire',
    ctaContact: 'Nous contacter',
    ctaVisit: 'Infos visiteurs',
    confSuffix: 'conférences au programme',
  },
  en: {
    eyebrow: 'Confidential preview',
    heroTitle: 'MediaDays Solutions × Paris Radio Show 2026',
    heroSubtitle:
      'An exclusive preview of the 2026 programme. The themes are set — speakers and schedule revealed soon.',
    datesLieux: 'Paris · December 15, 2026   —   Marseille · December 10, 2026',
    kpiConf: 'conferences',
    kpiSpeakers: 'speakers',
    kpiPoles: 'thematic tracks',
    repartitionTitle: 'Breakdown by track',
    mdsTrack: 'MediaDays Solutions',
    mdsTagline: 'Every medium, every solution.',
    prsTrack: 'Paris Radio Show',
    prsTagline: 'The radio & audio gathering.',
    targetAudience: 'Who for?',
    teaserNote: 'Speakers and schedule revealed soon.',
    ctaTitle: 'Want to be part of it?',
    ctaSubtitle: 'Secure your place in the 2026 programme.',
    ctaPartner: 'Become a partner',
    ctaContact: 'Contact us',
    ctaVisit: 'Visitor info',
    confSuffix: 'conferences scheduled',
  },
};
