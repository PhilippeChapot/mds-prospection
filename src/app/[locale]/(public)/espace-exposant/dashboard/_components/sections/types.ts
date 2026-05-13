/**
 * P5.x.17 — types partages entre les composants de section de l'Espace
 * Exposant V1.3. Evite que chaque section reimporte le shape complet.
 */

import type { EspaceExposantDashboardData } from '@/lib/espace-exposant/session';
import type { getDocumentLinks, getCommunicationKit } from '@/lib/espace-exposant/documents';

export type DocumentLinks = ReturnType<typeof getDocumentLinks>;
export type CommKit = ReturnType<typeof getCommunicationKit>;

export interface SectionData extends EspaceExposantDashboardData {
  documents: DocumentLinks;
  commKit: CommKit;
}

export interface SectionProps {
  data: SectionData;
  locale: 'fr' | 'en';
}
