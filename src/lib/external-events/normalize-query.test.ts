/**
 * P5.x.MatchingFix — tests helpers normalize-query.
 */

import { describe, it, expect } from 'vitest';
import { normalizeNameJs, ilikePatternForName } from './normalize-query';

describe('normalizeNameJs (P5.x.MatchingFix)', () => {
  it('case insensitive : Lawo == LAWO == lawo', () => {
    expect(normalizeNameJs('Lawo')).toBe('LAWO');
    expect(normalizeNameJs('LAWO')).toBe('LAWO');
    expect(normalizeNameJs('lawo')).toBe('LAWO');
  });

  it('strip diacritics : Calaméo == Calameo', () => {
    expect(normalizeNameJs('Calaméo')).toBe('CALAMEO');
    expect(normalizeNameJs('Calameo')).toBe('CALAMEO');
    expect(normalizeNameJs('CALAMÉO')).toBe('CALAMEO');
  });

  it('garde la ponctuation utile (+, -, &)', () => {
    expect(normalizeNameJs('Canal+ Brand Solutions')).toBe('CANAL+ BRAND SOLUTIONS');
    expect(normalizeNameJs('E-Novate')).toBe('E-NOVATE');
    expect(normalizeNameJs('A&B')).toBe('A&B');
  });

  it('collapse multiple spaces + trim', () => {
    expect(normalizeNameJs('  Foo   Bar  ')).toBe('FOO BAR');
  });

  it('null / undefined / empty -> empty string', () => {
    expect(normalizeNameJs(null)).toBe('');
    expect(normalizeNameJs(undefined)).toBe('');
    expect(normalizeNameJs('')).toBe('');
  });
});

describe('ilikePatternForName', () => {
  it('retourne le meme resultat que normalizeNameJs', () => {
    expect(ilikePatternForName('Lawo')).toBe('LAWO');
    expect(ilikePatternForName('Canal+ Brand')).toBe('CANAL+ BRAND');
  });
});
