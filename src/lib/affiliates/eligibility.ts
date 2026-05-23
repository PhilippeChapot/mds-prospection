/**
 * Helper eligibilite commission affilie — P7.x.1.D
 *
 * Doctrine business : la commission affiliation NE s'applique PAS aux
 * exposants Paris Radio Show 2026 existants (companies.category =
 * 'prs_exhibitor'). PRS a son propre programme tarifaire et ne fait pas
 * partie du periametre commission MDS.
 *
 * Toute autre societe (category='standard' ou 'non_eligible') convertie
 * via affiliation genere commission normalement.
 *
 * Pure function — testable sans DB.
 */

import type { Database } from '@/lib/supabase/database.types';

export type CompanyCategory = Database['public']['Enums']['category_tarif'];

export interface CompanyEligibilityInput {
  category: CompanyCategory | null;
}

/**
 * Retourne true si la societe est eligible a la commission affilie.
 *
 * Regle unique (P7.x.1.D) : exclusion uniquement pour `prs_exhibitor`.
 * Les categories 'standard' et 'non_eligible' restent commissionnables
 * (un prospect 'non_eligible' n'aura tres probablement pas de devis,
 * donc le calcul de commission tombe naturellement a 0 au niveau du
 * total_ttc, mais on n'ajoute pas de filter explicite ici).
 *
 * NULL = retro-compat (les anciennes companies sans category sont
 * considerees eligibles par defaut).
 */
export function isCommissionEligibleForCompany(input: CompanyEligibilityInput): boolean {
  return input.category !== 'prs_exhibitor';
}
