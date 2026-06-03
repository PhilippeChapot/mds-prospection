/**
 * P6.x.1b — éligibilité aux commandes complémentaires depuis l'Espace Partenaire.
 *
 * Règle métier : l'partenaire doit avoir signé son devis (signed_at NOT NULL +
 * status in une liste post-signature). Avant signature, accès interdit
 * (impossible d'acheter des options à un devis qui n'est pas encore signé).
 */

export type EligibilityCheck =
  | { eligible: true }
  | { eligible: false; reason: string; reasonCode: 'not_signed' | 'wrong_status' | 'no_prospect' };

const SIGNED_OR_BEYOND_STATUSES = new Set<string>(['signe', 'acompte_paye', 'paye_integral']);

export interface ProspectEligibilityInput {
  status: string;
  signed_at: string | null;
}

export function canAccessSupplementaryOrders(
  prospect: ProspectEligibilityInput | null,
): EligibilityCheck {
  if (!prospect) {
    return {
      eligible: false,
      reason: 'Prospect introuvable.',
      reasonCode: 'no_prospect',
    };
  }
  if (!prospect.signed_at) {
    return {
      eligible: false,
      reason:
        "Le devis n'a pas encore été signé. Une fois signé, vous pourrez commander des options et services additionnels.",
      reasonCode: 'not_signed',
    };
  }
  if (!SIGNED_OR_BEYOND_STATUSES.has(prospect.status)) {
    return {
      eligible: false,
      reason: `Statut prospect actuel (${prospect.status}) incompatible. Contactez l'équipe.`,
      reasonCode: 'wrong_status',
    };
  }
  return { eligible: true };
}
