/**
 * P5.x.24 — tests rank-company helper.
 *
 * Fixe le bug ALGAM : "ALGAM" doit retourner "ALGAM ENTREPRISES" en top,
 * pas LAGARDERE / A2PRL / Lokal Rundfunk.
 */

import { describe, it, expect } from 'vitest';
import { scoreCompany, rankCompanyMatches } from './rank-company';

const ALGAM = {
  id: '1',
  name: 'ALGAM ENTREPRISES',
  name_normalized: 'algam entreprises',
  primary_domain: 'algam.com',
};
const LAGARDERE = {
  id: '2',
  name: 'LAGARDERE NEWS',
  name_normalized: 'lagardere news',
  primary_domain: 'lagardere.com',
};
const A2PRL = {
  id: '3',
  name: 'A2PRL',
  name_normalized: 'a2prl',
  primary_domain: 'mediameeting.fr',
};
const LOKAL = {
  id: '4',
  name: 'Lokal Rundfunk',
  name_normalized: 'lokal rundfunk',
  primary_domain: 'lokal.de',
};

describe('scoreCompany', () => {
  it('returns 100 for startsWith match', () => {
    expect(scoreCompany('algam', ALGAM)).toBe(100);
    expect(scoreCompany('ALG', ALGAM)).toBe(100);
  });

  it('returns 50 for contains substring (not at start)', () => {
    expect(scoreCompany('news', LAGARDERE)).toBe(50);
  });

  it('returns 30 for domain match', () => {
    expect(
      scoreCompany('mediameeting', { id: 'x', name: 'X', primary_domain: 'mediameeting.fr' }),
    ).toBe(30);
  });

  it('returns 10 for fuzzy match (chars in order)', () => {
    // 'lkr' présent dans 'lokal rundfunk' dans l'ordre (l-o-k-a-l → 'l','k', puis r-u-n-d → 'r')
    expect(scoreCompany('lkr', LOKAL)).toBe(10);
  });

  it('returns 0 for no match', () => {
    expect(scoreCompany('xyz123', ALGAM)).toBe(0);
  });
});

describe('rankCompanyMatches (bug ALGAM)', () => {
  it('ranks ALGAM ENTREPRISES first when searching "ALGAM"', () => {
    const ranked = rankCompanyMatches('ALGAM', [LAGARDERE, A2PRL, ALGAM, LOKAL]);
    expect(ranked[0]?.id).toBe(ALGAM.id);
  });

  it('returns empty list when no match', () => {
    const ranked = rankCompanyMatches('xyz9999', [ALGAM, LAGARDERE]);
    expect(ranked).toEqual([]);
  });

  it('respects limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      name: `Alpha ${i}`,
      name_normalized: `alpha ${i}`,
      primary_domain: null,
    }));
    expect(rankCompanyMatches('alpha', many, 5)).toHaveLength(5);
  });

  it('returns alphabetical order when no query', () => {
    const ranked = rankCompanyMatches('', [LAGARDERE, ALGAM, A2PRL]);
    expect(ranked.map((c) => c.id)).toEqual(['3', '1', '2']); // A2PRL < ALGAM < LAGARDERE
  });
});
