/**
 * Construit le champ `subject` (« Objet ») des documents Sellsy V2 (devis,
 * facture, pro-forma). Garantit que l'objet n'est jamais vide.
 *
 * Format cible :
 *   "MediaDays Solutions / Paris Radio Show"                     (fallback)
 *   "MediaDays Solutions / Paris Radio Show — Stand F4"          (+ stand)
 *   "MediaDays Solutions / Paris Radio Show — Pack CLASSIC"      (+ pack)
 *   "MediaDays Solutions / Paris Radio Show — Stand F4 — Pack CLASSIC"
 */

import type { QuoteItem } from '@/lib/admin/prospects/quote-calc';

const BASE_LABEL = 'MediaDays Solutions / Paris Radio Show';

export function buildSellsySubject(input: {
  packCode?: string | null;
  boothAssignment?: string | null;
  items?: Array<Pick<QuoteItem, 'category' | 'name'>>;
}): string {
  const parts: string[] = [BASE_LABEL];

  const booth = input.boothAssignment?.trim();
  if (booth) parts.push(`Stand ${booth}`);

  const packItem = input.items?.find((it) => it.category === 'pack');
  const packLabel = packItem?.name?.trim() || (input.packCode ? `Pack ${input.packCode}` : null);
  if (packLabel) parts.push(packLabel);

  return parts.join(' — ');
}
