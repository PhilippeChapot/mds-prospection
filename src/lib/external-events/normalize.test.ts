/**
 * P5.x.ExternalEvents — tests normalize helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeCompanyName,
  normalizeDomain,
  parseYearsFromCell,
  levenshtein,
  similarityScore,
} from './normalize';

describe('normalizeCompanyName', () => {
  it('lowercase + strip accents', () => {
    expect(normalizeCompanyName('Société Démo')).toBe('societe demo');
  });

  it('strip legal suffix SAS / SARL / SA / LTD / GmbH', () => {
    expect(normalizeCompanyName('Acme SAS')).toBe('acme');
    expect(normalizeCompanyName('Acme SARL')).toBe('acme');
    expect(normalizeCompanyName('Acme LTD')).toBe('acme');
    expect(normalizeCompanyName('Acme GmbH')).toBe('acme');
  });

  it('collapse multiple spaces + punctuation', () => {
    expect(normalizeCompanyName('  Acme   Corp.  ')).toBe('acme');
    expect(normalizeCompanyName('JC Decaux')).toBe('jc decaux');
  });

  it('preserves & and + (Canal+ case)', () => {
    expect(normalizeCompanyName('Canal+')).toBe('canal+');
    expect(normalizeCompanyName('A&B Co')).toBe('a&b');
  });

  it('empty input returns empty', () => {
    expect(normalizeCompanyName('')).toBe('');
  });
});

describe('normalizeDomain', () => {
  it('lowercase + strip protocol + www', () => {
    expect(normalizeDomain('https://www.Example.COM')).toBe('example.com');
    expect(normalizeDomain('http://example.com/path?q=1')).toBe('example.com');
  });

  it('returns null for invalid', () => {
    expect(normalizeDomain(null)).toBe(null);
    expect(normalizeDomain('')).toBe(null);
    expect(normalizeDomain('no-dot')).toBe(null);
  });
});

describe('parseYearsFromCell', () => {
  it('extracts multiple years 20XX', () => {
    expect(parseYearsFromCell('MEDIADAYS 2023, 2024 et 2026')).toEqual([2023, 2024, 2026]);
  });

  it('dedup + sort', () => {
    expect(parseYearsFromCell('2025 / 2023 / 2025')).toEqual([2023, 2025]);
  });

  it('respects min/max', () => {
    expect(parseYearsFromCell('MEDIADAYS 2020 et 2030', { minYear: 2023, maxYear: 2026 })).toEqual(
      [],
    );
  });

  it('empty input', () => {
    expect(parseYearsFromCell(null)).toEqual([]);
    expect(parseYearsFromCell('')).toEqual([]);
  });
});

describe('levenshtein + similarityScore', () => {
  it('identical strings have similarity 1', () => {
    expect(similarityScore('acme', 'acme')).toBe(1);
  });

  it('one-char diff has high similarity', () => {
    expect(similarityScore('acme', 'acmd')).toBeGreaterThan(0.7);
  });

  it('totally different have low similarity', () => {
    expect(similarityScore('acme', 'xyz')).toBeLessThan(0.5);
  });

  it('levenshtein basic cases', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('a', '')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});
