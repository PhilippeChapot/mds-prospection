/**
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import robots from './robots';

describe('robots()', () => {
  const result = robots();
  const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
  const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];

  it('disallow /admin', () => {
    expect(disallow).toContain('/admin');
  });

  it('disallow les espaces authentifies (partenaire, visiteur, affilie)', () => {
    expect(disallow.some((d) => d?.includes('espace-partenaire'))).toBe(true);
    expect(disallow.some((d) => d?.includes('espace-visiteur'))).toBe(true);
  });

  it('reference le sitemap', () => {
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
