/**
 * P5.x.17 — types partages entre les composants de section de l'Espace
 * Partenaire V1.3. Evite que chaque section reimporte le shape complet.
 */

import type { EspacePartenaireDashboardData } from '@/lib/espace-partenaire/session';
import type { getDocumentLinks, getCommunicationKit } from '@/lib/espace-partenaire/documents';
import type { StandPublicView } from '@/lib/espace-partenaire/stands-public-view';

export type DocumentLinks = ReturnType<typeof getDocumentLinks>;
export type CommKit = ReturnType<typeof getCommunicationKit>;

export interface SectionData extends EspacePartenaireDashboardData {
  documents: DocumentLinks;
  commKit: CommKit;
  /** P6.x.3 — stands Salle Le Notre (sanitized RGPD, pas de contact_email). */
  leNotreStands: StandPublicView[];
  /** P6.x.3 — stand de l'partenaire (match par booth_assignment) ou null. */
  myStand: StandPublicView | null;
}

export interface SectionProps {
  data: SectionData;
  locale: 'fr' | 'en';
}
