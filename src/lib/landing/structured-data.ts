/**
 * SEO — JSON-LD Schema.org de la landing (Organization, WebSite, 3x
 * BusinessEvent). Extrait de page.tsx pour rester testable sans tirer
 * la chaine d'imports next-intl/Link (fragile en environnement Vitest node).
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';

const ORGANIZER = { '@type': 'Organization', name: 'Editions HF', url: APP_URL } as const;

export const LANDING_JSON_LD = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'MediaDays Solutions',
    alternateName: 'MDS Solutions',
    url: APP_URL,
    logo: `${APP_URL}/brand/MDSLogo_final_bleu_ligne.png`,
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'philippe@mediadays.solutions',
      contactType: 'coordinator',
      availableLanguage: ['French', 'English'],
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: APP_URL,
    name: 'MediaDays Solutions',
    inLanguage: ['fr-FR', 'en-US'],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BusinessEvent',
    name: 'MediaDays Paris 2026',
    startDate: '2026-12-15T09:00:00+01:00',
    endDate: '2026-12-15T18:00:00+01:00',
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: 'Carrousel du Louvre',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '99 rue de Rivoli',
        addressLocality: 'Paris',
        postalCode: '75001',
        addressCountry: 'FR',
      },
    },
    organizer: ORGANIZER,
    image: `${APP_URL}/og/og-image-mds-2026.png`,
    description:
      'Le rendez-vous des professionnels des médias à Paris — Radio, podcast, vidéo, adtech, DOOH.',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BusinessEvent',
    name: 'MediaDays Marseille 2026',
    startDate: '2026-12-10T09:00:00+01:00',
    endDate: '2026-12-10T18:00:00+01:00',
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: 'Palais du Pharo',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Marseille',
        postalCode: '13007',
        addressCountry: 'FR',
      },
    },
    organizer: ORGANIZER,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BusinessEvent',
    name: 'MediaDays Bruxelles 2026',
    startDate: '2026-11-26T09:00:00+01:00',
    endDate: '2026-11-26T18:00:00+01:00',
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: 'Mix Brussels',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Brussels',
        addressCountry: 'BE',
      },
    },
    organizer: ORGANIZER,
  },
];
