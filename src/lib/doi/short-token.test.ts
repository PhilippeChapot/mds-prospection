import { describe, it, expect } from 'vitest';
import {
  generateShortToken,
  computeShortTokenExpiresAt,
  SHORT_TOKEN_LENGTH,
  SHORT_TOKEN_ALPHABET,
  SHORT_TOKEN_TTL_SECONDS,
} from './short-token';

describe('generateShortToken', () => {
  it('produces a 16-char token', () => {
    const token = generateShortToken();
    expect(token).toHaveLength(SHORT_TOKEN_LENGTH);
  });

  it('uses only chars from the unambiguous alphabet (no 0/O/I/l/1)', () => {
    for (let i = 0; i < 50; i += 1) {
      const token = generateShortToken();
      for (const ch of token) {
        expect(SHORT_TOKEN_ALPHABET).toContain(ch);
      }
      // sanity check : aucun caractere ambigu
      expect(token).not.toMatch(/[0OIl1]/);
    }
  });

  it('generates 1000 unique tokens (no collision)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      set.add(generateShortToken());
    }
    expect(set.size).toBe(1000);
  });
});

describe('computeShortTokenExpiresAt', () => {
  it('returns a Date roughly 24h in the future', () => {
    const before = Date.now();
    const exp = computeShortTokenExpiresAt();
    const after = Date.now();
    const expMs = exp.getTime();

    // Tolerance large pour les tests sur CI lents.
    expect(expMs).toBeGreaterThanOrEqual(before + SHORT_TOKEN_TTL_SECONDS * 1000 - 100);
    expect(expMs).toBeLessThanOrEqual(after + SHORT_TOKEN_TTL_SECONDS * 1000 + 100);
  });
});
