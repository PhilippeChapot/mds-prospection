/**
 * @vitest-environment node
 *
 * P5.x.CompaniesListEnrichments — filtre Tag salon (parsing + OR PostgREST).
 */

import { describe, it, expect } from 'vitest';
import { parseEventTagKeys, buildEventTagsOrExpr } from './filter';

describe('parseEventTagKeys (P5.x)', () => {
  it('CSV valide → clés', () => {
    expect(parseEventTagKeys('prs,satis')).toEqual(['prs', 'satis']);
  });
  it('ignore les clés inconnues', () => {
    expect(parseEventTagKeys('prs,bogus,cbd')).toEqual(['prs', 'cbd']);
  });
  it('respecte l’ordre d’affichage (pas l’ordre CSV)', () => {
    expect(parseEventTagKeys('cbd,prs')).toEqual(['prs', 'cbd']);
  });
  it('vide / null → []', () => {
    expect(parseEventTagKeys('')).toEqual([]);
    expect(parseEventTagKeys(null)).toEqual([]);
  });
});

describe('buildEventTagsOrExpr (P5.x)', () => {
  it('une clé → un terme', () => {
    expect(buildEventTagsOrExpr(['prs'])).toBe('external_event_tags->prs.not.is.null');
  });
  it('plusieurs clés → OR (CSV)', () => {
    expect(buildEventTagsOrExpr(['prs', 'satis'])).toBe(
      'external_event_tags->prs.not.is.null,external_event_tags->satis.not.is.null',
    );
  });
});
