/**
 * @vitest-environment node
 *
 * P7.x.1.F — tests fuzzy helpers (pure).
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  diceCoefficient,
  fuzzyRank,
  MATCH_EXACT_THRESHOLD,
  MATCH_SUGGEST_THRESHOLD,
} from './fuzzy';

describe('normalizeName (P7.x.1.F)', () => {
  it('strip diacritics + lower + remove non-alphanum', () => {
    expect(normalizeName("L'Équipe Médias!")).toBe('lequipemedias');
    expect(normalizeName('Radio France')).toBe('radiofrance');
    expect(normalizeName('RTL-2025_Group')).toBe('rtl2025group');
  });
});

describe('diceCoefficient (P7.x.1.F)', () => {
  it('match exact -> 1', () => {
    expect(diceCoefficient('Radio France', 'Radio France')).toBe(1);
    // Case + diacritics normalises -> 1
    expect(diceCoefficient('Radio France', 'radio-france')).toBe(1);
  });

  it('typo single char -> score eleve (proche 1)', () => {
    // "RTL" -> "RTLL" (typo) : doit etre > 0.6
    const score = diceCoefficient('RTL Group', 'RTLL Group');
    expect(score).toBeGreaterThan(MATCH_SUGGEST_THRESHOLD);
  });

  it('completely different -> score faible (< 0.5)', () => {
    const score = diceCoefficient('Radio France', 'Microsoft Corp');
    expect(score).toBeLessThan(0.5);
  });

  it('strings tres courtes (< 3 chars) -> utilise bigrammes (pas 0 systematique)', () => {
    expect(diceCoefficient('RT', 'RT')).toBe(1);
  });

  it('strings 1 char -> 0 (pas de bigrammes possibles)', () => {
    expect(diceCoefficient('A', 'B')).toBe(0);
  });

  it("single-char typo 'Lukas' vs 'Lucas' -> match SUGGEST range (0.6-0.85)", () => {
    const score = diceCoefficient('Lucas Aubree', 'Lukas Aubree');
    expect(score).toBeGreaterThan(MATCH_SUGGEST_THRESHOLD);
    expect(score).toBeLessThan(MATCH_EXACT_THRESHOLD);
  });

  it('seuil exact 0.85 : casse + accents diff = match exact (apres normalize)', () => {
    expect(diceCoefficient('Lucas Aubrée', 'lucas aubree')).toBe(1);
    expect(diceCoefficient('Radio France', 'RADIO-FRANCE')).toBe(1);
  });
});

describe('fuzzyRank (P7.x.1.F)', () => {
  const AFFILIATES = [
    { id: '1', display_name: 'Radio France' },
    { id: '2', display_name: 'Lucas Aubrée' },
    { id: '3', display_name: 'Acme Media Group' },
    { id: '4', display_name: 'Test Affilié 2026' },
  ];

  it('query exact -> 1 match score=1', () => {
    const ranked = fuzzyRank(AFFILIATES, 'Lucas Aubrée', (a) => a.display_name);
    expect(ranked[0].item.id).toBe('2');
    expect(ranked[0].score).toBe(1);
  });

  it('query fuzzy -> top match remonte (sort par score desc)', () => {
    const ranked = fuzzyRank(AFFILIATES, 'lukas aubree', (a) => a.display_name);
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    expect(ranked[0].item.id).toBe('2');
  });

  it('threshold 0.85 filtre les matches faibles', () => {
    // "Random Inc" : aucun match plausible -> liste vide avec threshold 0.85
    const ranked = fuzzyRank(
      AFFILIATES,
      'Random Inc',
      (a) => a.display_name,
      MATCH_EXACT_THRESHOLD,
    );
    expect(ranked).toEqual([]);
  });

  it('liste vide en entree -> liste vide en sortie', () => {
    expect(fuzzyRank([], 'anything', (a: { display_name: string }) => a.display_name)).toEqual([]);
  });
});
