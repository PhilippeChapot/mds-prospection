/**
 * Wording "J'EXPOSE AU/AUX" selon la categorie tarif de l'exposant.
 *
 * Regle metier (P5.x.12.bis) :
 *  - PRS exhibitor : "J'EXPOSE AU" (singulier masculin — un seul event,
 *    Paris Radio Show)
 *  - Autres        : "J'EXPOSE AUX" (pluriel — MediaDays Solutions =
 *    Paris + Marseille)
 *
 * P5.x.14 — extrait depuis /api/badge/[companyId]/badge.png.
 */

import type { Database } from '@/lib/supabase/database.types';

type CategoryTarif = Database['public']['Enums']['category_tarif'];

export function getExhibitorWording(
  category: CategoryTarif | null,
  locale: 'fr' | 'en' = 'fr',
): string {
  const isPrs = category === 'prs_exhibitor';
  if (locale === 'en') {
    return isPrs ? "I'M EXHIBITING AT" : "I'M EXHIBITING AT";
  }
  return isPrs ? "J'EXPOSE AU" : "J'EXPOSE AUX";
}
