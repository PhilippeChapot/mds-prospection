/**
 * calculateCommission — P5.x.7
 *
 * Calcule le montant de commission affilie en EUR HT.
 *
 * Doctrine business (Phil) :
 *   - Commission flat : `commission_percent` % du montant HT du devis.
 *   - Calcul declenche quand acompte_paid_at est set (acompte ou paiement
 *     integral). Idempotence garantie cote caller via check
 *     `!prospect.commission_eur_ht`.
 *   - Autoliquidation TVA UE non-FR : sellsy_devis_total_ttc est deja
 *     en HT (pas de TVA appliquee), donc on n'applique pas le /1.20.
 *   - TVA FR standard : sellsy_devis_total_ttc inclut 20% de TVA, on
 *     divise par 1.20 pour retomber sur le HT.
 *
 * Pure function — testable sans DB.
 */

export interface CommissionCalcInput {
  /** Total devis Sellsy. TTC en mode FR standard, HT direct si autoliquidation. */
  totalSellsyAmount: number;
  /** True si autoliquidation Art. 196 (UE non-FR + VIES verifie). */
  isAutoliquidation: boolean;
  /** Pourcentage de commission, 0-100. Ex: 10 pour 10%. */
  commissionPercent: number;
}

export interface CommissionCalcResult {
  /** Montant HT a commissionner (devis HT). */
  baseHt: number;
  /** Montant final de commission EUR HT, arrondi a 2 decimales. */
  commissionEurHt: number;
}

const FR_VAT_RATE = 0.2;

export function calculateCommission(input: CommissionCalcInput): CommissionCalcResult {
  if (
    !Number.isFinite(input.totalSellsyAmount) ||
    input.totalSellsyAmount <= 0 ||
    !Number.isFinite(input.commissionPercent) ||
    input.commissionPercent <= 0
  ) {
    return { baseHt: 0, commissionEurHt: 0 };
  }

  // Autoliquidation : le total Sellsy est deja en HT (TVA 0% Art. 196).
  // FR standard : on retombe sur le HT en divisant par 1.20.
  const baseHt = input.isAutoliquidation
    ? input.totalSellsyAmount
    : input.totalSellsyAmount / (1 + FR_VAT_RATE);

  const rate = input.commissionPercent / 100;
  const commissionEurHt = Math.round(baseHt * rate * 100) / 100;

  return { baseHt: Math.round(baseHt * 100) / 100, commissionEurHt };
}
