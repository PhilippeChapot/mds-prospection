/**
 * P5.x.MatchingFix — tests normalizeCountryToIso.
 */

import { describe, it, expect } from 'vitest';
import { normalizeCountryToIso } from './country';

describe('normalizeCountryToIso (P5.x.MatchingFix)', () => {
  it('FR (deja ISO) -> FR', () => {
    expect(normalizeCountryToIso('FR')).toBe('FR');
    expect(normalizeCountryToIso('fr')).toBe('FR');
  });

  it('France (texte plein) -> FR', () => {
    expect(normalizeCountryToIso('France')).toBe('FR');
    expect(normalizeCountryToIso('FRANCE')).toBe('FR');
    expect(normalizeCountryToIso('  france  ')).toBe('FR');
  });

  it('united kingdom / UK / Royaume-Uni -> GB', () => {
    expect(normalizeCountryToIso('united kingdom')).toBe('GB');
    expect(normalizeCountryToIso('UK')).toBe('GB');
    expect(normalizeCountryToIso('Royaume-Uni')).toBe('GB');
    expect(normalizeCountryToIso('England')).toBe('GB');
  });

  it('Belgique / Belgium / Belgie -> BE', () => {
    expect(normalizeCountryToIso('Belgique')).toBe('BE');
    expect(normalizeCountryToIso('Belgium')).toBe('BE');
    expect(normalizeCountryToIso('Belgie')).toBe('BE');
  });

  it('Allemagne / Germany / Deutschland -> DE', () => {
    expect(normalizeCountryToIso('Allemagne')).toBe('DE');
    expect(normalizeCountryToIso('Germany')).toBe('DE');
    expect(normalizeCountryToIso('Deutschland')).toBe('DE');
  });

  it('États-Unis / USA / United States -> US', () => {
    expect(normalizeCountryToIso('États-Unis')).toBe('US');
    expect(normalizeCountryToIso('USA')).toBe('US');
    expect(normalizeCountryToIso('United States')).toBe('US');
  });

  it('null / empty -> null', () => {
    expect(normalizeCountryToIso(null)).toBe(null);
    expect(normalizeCountryToIso(undefined)).toBe(null);
    expect(normalizeCountryToIso('')).toBe(null);
    expect(normalizeCountryToIso('   ')).toBe(null);
  });

  it('pays inconnu -> null (mieux que stocker du texte plein)', () => {
    expect(normalizeCountryToIso('Atlantide')).toBe(null);
    // Edge case : 2 lettres custom mais ISO -> garde tel quel (XK Kosovo, etc.)
    expect(normalizeCountryToIso('XK')).toBe('XK');
  });
});
