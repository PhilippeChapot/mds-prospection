/**
 * P5.x.MatchingFix — tests des helpers du script de cleanup.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeNameForCluster,
  scoreCompletenessForCleanup,
  mergeEventTagsForCleanup,
  pickBestCountryForCleanup,
} from './cleanup-helpers';

describe('normalizeNameForCluster (P5.x.MatchingFix)', () => {
  it('cluster key insensible casse + accents', () => {
    expect(normalizeNameForCluster('Lawo')).toBe('LAWO');
    expect(normalizeNameForCluster('LAWO')).toBe('LAWO');
    expect(normalizeNameForCluster('Calaméo')).toBe('CALAMEO');
    expect(normalizeNameForCluster('CANAL+ BRAND SOLUTIONS')).toBe('CANAL+ BRAND SOLUTIONS');
    expect(normalizeNameForCluster('Canal+ Brand Solutions')).toBe('CANAL+ BRAND SOLUTIONS');
  });
});

describe('scoreCompletenessForCleanup', () => {
  it('compte les champs critiques non-null', () => {
    expect(
      scoreCompletenessForCleanup({
        website: 'x',
        primary_domain: 'x',
        raw_address: 'x',
        city: 'x',
        postal_code: 'x',
      }),
    ).toBe(5);
    expect(
      scoreCompletenessForCleanup({
        website: null,
        primary_domain: '',
        raw_address: 'x',
      }),
    ).toBe(1);
    expect(scoreCompletenessForCleanup({})).toBe(0);
  });
});

describe('mergeEventTagsForCleanup', () => {
  it('union par event_key avec dedup + sort', () => {
    const keeper: Record<string, number[]> = { prs: [2026] };
    const others: Array<Record<string, number[]>> = [
      { satis: [2025] },
      { prs: [2025], cbd: [2024] },
    ];
    const merged = mergeEventTagsForCleanup(keeper, others);
    expect(merged).toEqual({ prs: [2025, 2026], satis: [2025], cbd: [2024] });
  });
  it('keeper vide + others remplis', () => {
    expect(mergeEventTagsForCleanup(null, [{ prs: [2026] }])).toEqual({ prs: [2026] });
  });
  it('keeper rempli + others vides', () => {
    expect(mergeEventTagsForCleanup({ prs: [2026] }, [null, null])).toEqual({ prs: [2026] });
  });
});

describe('pickBestCountryForCleanup', () => {
  it('prefere ISO 2 lettres en place', () => {
    expect(
      pickBestCountryForCleanup([{ country: 'France' }, { country: 'FR' }, { country: null }]),
    ).toBe('FR');
  });
  it("normalise 'France' -> FR si pas d ISO en place", () => {
    expect(pickBestCountryForCleanup([{ country: 'France' }])).toBe('FR');
  });
  it('tous null -> null', () => {
    expect(pickBestCountryForCleanup([{ country: null }, { country: null }])).toBe(null);
  });
});
