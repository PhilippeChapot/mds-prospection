/**
 * @vitest-environment node
 *
 * P11.x.Rebrand — verifie la configuration next.config.ts pour les
 * redirections 308 permanent /espace-exposant -> /espace-partenaire.
 *
 * On ne peut pas tester le runtime Next dans Vitest, mais on peut
 * vérifier que la config exporte bien `redirects()` avec les bons
 * patterns + flag permanent=true.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('next.config redirects (P11.x.Rebrand)', () => {
  const cfg = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8');

  it('contient une fn async redirects()', () => {
    expect(cfg).toMatch(/async redirects\(\)/);
  });

  it('redirige /:locale/espace-exposant/:path* -> /:locale/espace-partenaire/:path*', () => {
    expect(cfg).toMatch(
      /source:\s*['"]\/:locale\/espace-exposant\/:path\*['"]\s*,\s*destination:\s*['"]\/:locale\/espace-partenaire\/:path\*['"]/,
    );
  });

  it('redirige /:locale/espace-exposant (root) -> /:locale/espace-partenaire', () => {
    expect(cfg).toMatch(
      /source:\s*['"]\/:locale\/espace-exposant['"]\s*,\s*destination:\s*['"]\/:locale\/espace-partenaire['"]/,
    );
  });

  it('redirige /api/espace-exposant/* -> /api/espace-partenaire/*', () => {
    expect(cfg).toMatch(/\/api\/espace-exposant\/:path\*/);
    expect(cfg).toMatch(/\/api\/espace-partenaire\/:path\*/);
  });

  it('utilise permanent: true (= 308)', () => {
    expect(cfg).toMatch(/permanent:\s*true/);
    // Au moins 4 occurrences (5 redirects au total)
    const matches = cfg.match(/permanent:\s*true/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
