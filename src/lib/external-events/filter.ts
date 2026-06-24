/**
 * P5.x.CompaniesListEnrichments — helpers purs du filtre "Tag salon".
 * Parsing CSV → clés valides + construction de l'expression PostgREST OR.
 */

import { EVENT_DISPLAY_ORDER, type ExternalEventKey } from './types';

/** CSV "prs,satis,bogus" → clés valides ['prs','satis'] (ordre d'affichage). */
export function parseEventTagKeys(csv: string | null | undefined): ExternalEventKey[] {
  if (!csv) return [];
  const raw = new Set(
    csv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return EVENT_DISPLAY_ORDER.filter((k) => raw.has(k));
}

/**
 * Expression `.or()` PostgREST : société ayant AU MOINS une des clés présentes
 * dans external_event_tags (JSONB objet {key:[years]}).
 */
export function buildEventTagsOrExpr(keys: ExternalEventKey[]): string {
  return keys.map((key) => `external_event_tags->${key}.not.is.null`).join(',');
}
