/**
 * P6.x.1a-ter — tests formatage prix HT.
 *
 * NB : on construit les strings attendus avec des espaces ASCII explicites
 * ( ) pour éviter que des espaces insécables ( ,  ) se
 * glissent dans les literals au moment de l'écriture/édition du fichier.
 */

import { describe, it, expect } from 'vitest';
import { formatEurHt } from './format';

const SP = ' '; // espace ASCII classique
const EUR_HT = `${SP}€${SP}HT`;

describe('formatEurHt', () => {
  it('formats positive number in fr-FR with 2 fraction digits + € HT suffix', () => {
    expect(formatEurHt(1234.56)).toBe(`1${SP}234,56${EUR_HT}`);
  });

  it('handles integer with .00 fraction', () => {
    expect(formatEurHt(1950)).toBe(`1${SP}950,00${EUR_HT}`);
  });

  it('accepts string (Supabase numeric may return as string)', () => {
    expect(formatEurHt('49.99')).toBe(`49,99${EUR_HT}`);
  });

  it('returns placeholder for null', () => {
    expect(formatEurHt(null)).toBe('—');
  });

  it('returns placeholder for undefined', () => {
    expect(formatEurHt(undefined)).toBe('—');
  });

  it('returns placeholder for empty string', () => {
    expect(formatEurHt('')).toBe('—');
  });

  it('returns placeholder for invalid string', () => {
    expect(formatEurHt('not-a-number')).toBe('—');
  });

  it('handles zero', () => {
    expect(formatEurHt(0)).toBe(`0,00${EUR_HT}`);
  });
});
