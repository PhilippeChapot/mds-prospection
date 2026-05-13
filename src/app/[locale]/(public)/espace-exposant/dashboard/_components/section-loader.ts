/**
 * P5.x.17 / P5.x.17-bis — helper unique pour fetch + enrichir les donnees
 * consommees par les 5 sous-pages de l'Espace Exposant V1.3.
 *
 * Le layout fait l'auth check (cookie + JWT) sans toucher la DB. Chaque
 * page appelle loadSectionData ici, ce qui declenche une seule query
 * Supabase (prospect + contact + company + count clicks) par render.
 *
 * getDocumentLinks / getCommunicationKit sont des helpers purs sans
 * DB ; juste un wrap pour partage entre sections.
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
