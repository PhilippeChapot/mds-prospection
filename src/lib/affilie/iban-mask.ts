/**
 * Helper masquage IBAN — P7.x.1.C
 *
 * Affiche un IBAN sous une forme partiellement masquee pour les emails
 * de confirmation virement. On garde les 4 premiers et 4 derniers
 * caracteres distinctement + le milieu en stars groupes par 4. Le dernier
 * groupe du milieu peut avoir 1-4 chars selon la longueur de l'IBAN.
 *
 * Exemples :
 *   FR7630001007941234567890185 (27 chars) -> "FR76 **** **** **** **** *** 0185"
 *   IT60X0542811101000000123456 (27 chars) -> "IT60 **** **** **** **** *** 3456"
 *   FR7611A8                    (8 chars)  -> "FR76 11A8"
 *   too short (< 8)                        -> "***"
 *
 * Pure function (testable sans DB).
 */
export function maskIban(raw: string | null | undefined): string {
  if (!raw) return '—';
  const iban = raw.replace(/\s+/g, '').toUpperCase();
  if (iban.length < 8) return '***';
  const prefix = iban.slice(0, 4);
  const suffix = iban.slice(-4);
  const middle = iban.slice(4, -4);

  if (middle.length === 0) {
    return `${prefix} ${suffix}`;
  }

  const middleStars = '*'.repeat(middle.length);
  const middleGroups: string[] = [];
  for (let i = 0; i < middleStars.length; i += 4) {
    middleGroups.push(middleStars.slice(i, i + 4));
  }
  return `${prefix} ${middleGroups.join(' ')} ${suffix}`;
}
