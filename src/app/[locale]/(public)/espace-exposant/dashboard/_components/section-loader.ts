/**
 * P5.x.17 — helper unique pour fetch + enrichir les donnees consommees
 * par les 5 sous-pages de l'Espace Exposant V1.3 (stand, coordonnees,
 * documents, kit-communication, invitations).
 *
 * loadDashboardData est wrap dans React.cache() cote session.ts -> les
 * sous-pages qui s'appellent l'une apres l'autre (cas typique d'une
 * nav SPA) ne refont pas le fetch du prospect/contact/company.
 *
 * Pareil pour getDocumentLinks / getCommunicationKit : ce sont des
 * helpers purs (pas de DB), donc juste un small wrap pour partage.
 */

import { loadDashboardData } from '@/lib/espace-exposant/session';
import { getDocumentLinks, getCommunicationKit } from '@/lib/espace-exposant/documents';
import type { SectionData } from './sections/types';

export async function loadSectionData(locale: 'fr' | 'en'): Promise<SectionData> {
  const loaded = await loadDashboardData(locale);
  const documents = getDocumentLinks({
    sellsyDevisPublicUrl: loaded.prospect.sellsy_devis_public_url,
    sellsyInvoicePublicUrl: loaded.prospect.sellsy_invoice_public_url,
  });
  // P5.x.10.bis : differencie la signature email selon la categorie tarifaire.
  const commKit = getCommunicationKit(locale, loaded.company.category);
  return { ...loaded, documents, commKit };
}

export function makeFormatters(locale: 'fr' | 'en') {
  const fmtEur = (n: number) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(n);

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));

  return { fmtEur, fmtDate };
}
