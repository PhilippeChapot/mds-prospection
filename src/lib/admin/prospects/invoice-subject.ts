/**
 * P5.x.SellsyInvoiceCreationFixes (Fix 2) — construit l'« Objet » du document
 * Sellsy (champ `subject`, confirmé OpenAPI V2 + curl prod) à partir des
 * données réellement présentes sur le prospect. Avant ce fix, le champ Objet
 * était vide côté Sellsy et Phil devait le saisir à la main.
 *
 * Module pur séparé de quote-builder-actions.ts (fichier 'use server' qui ne
 * peut exporter que des fonctions async).
 *
 * Format : "MediaDays Solutions 2026[ — Stand <booth>][ — <pack>]"
 *   - "MediaDays Solutions 2026" : nom d'événement umbrella (cohérent avec le
 *     reste du code, cf. ics-invite.ts / wording.ts).
 *   - Stand : booth_assignment du prospect s'il est attribué.
 *   - Pack : nom lisible de la ligne pack du Devis Builder (ex: "Pack CLASSIC"),
 *     fallback sur pack_code.
 *
 * Exemples :
 *   - { booth:'F4', items:[pack "Pack CLASSIC"] } → "MediaDays Solutions 2026 — Stand F4 — Pack CLASSIC"
 *   - { booth:null, packCode:'PREMIUM' }          → "MediaDays Solutions 2026 — Pack PREMIUM"
 */

import type { QuoteItem } from './quote-calc';

const EVENT_NAME_2026 = 'MediaDays Solutions 2026';

export function buildInvoiceSubject(input: {
  packCode: string | null;
  boothAssignment: string | null;
  items: Array<Pick<QuoteItem, 'category' | 'name'>>;
}): string {
  const parts: string[] = [EVENT_NAME_2026];

  const booth = input.boothAssignment?.trim();
  if (booth) parts.push(`Stand ${booth}`);

  const packItem = input.items.find((it) => it.category === 'pack');
  const packLabel = packItem?.name?.trim() || (input.packCode ? `Pack ${input.packCode}` : null);
  if (packLabel) parts.push(packLabel);

  return parts.join(' — ');
}
