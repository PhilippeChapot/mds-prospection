/**
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import sitemap from './sitemap';

describe('sitemap()', () => {
  const entries = sitemap();

  it('retourne au moins 3 URLs', () => {
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });

  it('inclut la landing FR et EN', () => {
    expect(entries.some((e) => e.url.endsWith('/fr'))).toBe(true);
    expect(entries.some((e) => e.url.endsWith('/en'))).toBe(true);
  });

  it('chaque entree porte un alternates.languages croise fr/en', () => {
    for (const entry of entries) {
      expect(entry.alternates?.languages).toBeDefined();
    }
  });
});
