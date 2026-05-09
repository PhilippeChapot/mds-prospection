/**
 * Doctrine P4.x.2 sujet C — calcule le statut prospect a partir du
 * cumul paye et du total TTC du devis.
 *
 *   - 0 < paid_pct < 100% -> 'acompte_paye'
 *   - paid_pct >= 100%    -> 'paye_integral'
 *
 * Tolerance : difference d'1 centime acceptee comme paiement integral
 * (cas TTC 9156.00 mais Stripe encaisse 9155.99 a cause d'un arrondi).
 *
 * 'signe' n'est PAS retourne par cette fonction : il est reserve a
 * l'event signature.completed (signature electronique reelle).
 *
 * Si le devis total TTC n'est pas connu (devis pre-existant non
 * peuple via migration 0029), on retourne 'acompte_paye' par defaut
 * (mieux d'etre conservateur que de marquer paye_integral a tort).
 */
export type PaymentStatusOutput = 'acompte_paye' | 'paye_integral';

const TOLERANCE_EUR = 0.01;

export function calculatePaymentStatus(
  totalPaidEur: number,
  devisTotalTtcEur: number | null,
): PaymentStatusOutput {
  if (devisTotalTtcEur == null || devisTotalTtcEur <= 0) {
    // Pas de TTC connu : on ne peut pas conclure 'paye_integral' avec
    // certitude. Conservateur = 'acompte_paye'.
    return 'acompte_paye';
  }
  if (totalPaidEur + TOLERANCE_EUR >= devisTotalTtcEur) {
    return 'paye_integral';
  }
  return 'acompte_paye';
}
