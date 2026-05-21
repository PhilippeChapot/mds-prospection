/**
 * @vitest-environment node
 *
 * P7.x.1.C — tests maskIban helper.
 */

import { describe, it, expect } from 'vitest';
import { maskIban } from './iban-mask';

describe('maskIban (P7.x.1.C)', () => {
  it('IBAN FR (27 chars) : prefix + 19 stars en 5 groupes (4+4+4+4+3) + suffix', () => {
    expect(maskIban('FR7630001007941234567890185')).toBe('FR76 **** **** **** **** *** 0185');
  });

  it('IBAN IT (27 chars) : meme pattern', () => {
    expect(maskIban('IT60X0542811101000000123456')).toBe('IT60 **** **** **** **** *** 3456');
  });

  it('strip espaces + uppercase avant masquage', () => {
    expect(maskIban('fr76 3000 1007 9412 3456 7890 185')).toBe('FR76 **** **** **** **** *** 0185');
  });

  it('null/undefined/empty -> "—"', () => {
    expect(maskIban(null)).toBe('—');
    expect(maskIban(undefined)).toBe('—');
    expect(maskIban('')).toBe('—');
  });

  it('IBAN trop court (< 8 chars) -> "***"', () => {
    expect(maskIban('FR7630')).toBe('***');
  });

  it('IBAN court (8 chars exact) : prefix + suffix sans masque interne', () => {
    expect(maskIban('FR7611A8')).toBe('FR76 11A8');
  });
});
