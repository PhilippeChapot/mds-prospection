/**
 * P6.x.3-ter — vue publique sanitized des stands pour l'espace partenaire.
 *
 * Doctrine RGPD stricte : la query admin `listStands()` ramène
 * `prospect.contact_email` (utile pour le Sheet admin), mais ce champ ne
 * doit JAMAIS être sérialisé dans les props d'un composant client rendu
 * côté partenaire — sinon n'importe quel partenaire connecté peut lire les
 * emails des voisins via DevTools / View Source.
 *
 * Ce helper convertit `StandWithProspect` -> `StandPublicView` (un strict
 * sous-ensemble sans contact_email ni autre PII) AVANT de passer la donnée
 * à un Client Component.
 *
 * Note typage : `StandWithProspect` est un sur-ensemble de `StandPublicView`
 * (il ajoute `contact_email` sur `prospect`). Donc tout composant qui
 * accepte `StandPublicView` accepte AUSSI `StandWithProspect` (compat
 * admin) sans changement.
 */

import type { StandWithProspect } from '@/lib/admin/stands/queries';

export interface StandPublicView {
  id: string;
  number: string;
  salle: StandWithProspect['salle'];
  taille_m2: number;
  pole_recommended: StandWithProspect['pole_recommended'];
  status: StandWithProspect['status'];
  position_x: number | null;
  position_y: number | null;
  position_w: number | null;
  position_h: number | null;
  prospect: {
    id: string;
    status: string;
    company_name: string | null;
    company_public_visibility: boolean;
  } | null;
}

export function toStandPublicView(stand: StandWithProspect): StandPublicView {
  return {
    id: stand.id,
    number: stand.number,
    salle: stand.salle,
    taille_m2: stand.taille_m2,
    pole_recommended: stand.pole_recommended,
    status: stand.status,
    position_x: stand.position_x,
    position_y: stand.position_y,
    position_w: stand.position_w,
    position_h: stand.position_h,
    prospect: stand.prospect
      ? {
          id: stand.prospect.id,
          status: stand.prospect.status,
          company_name: stand.prospect.company_name,
          company_public_visibility: stand.prospect.company_public_visibility,
          // Volontairement OMIS : contact_email (PII, ne doit pas fuiter
          // dans les props sérialisées côté client).
        }
      : null,
  };
}

export function toStandPublicViewList(stands: StandWithProspect[]): StandPublicView[] {
  return stands.map(toStandPublicView);
}
