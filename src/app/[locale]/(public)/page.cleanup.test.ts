/**
 * @vitest-environment node
 *
 * P6.x.4-a-nonies — garde-fou : le hero de la landing /[locale]/ ne doit
 * plus contenir les 2 cards "quick-info" Marseille / Paris-Radio-Show
 * (deplacees dans la section <EtapesSection /> P6.x.4-a-octies).
 *
 * On lit le source du fichier `page.tsx` et on verifie l'absence des
 * tokens caracteristiques. Test brittle volontairement : il sert de
 * regression — si quelqu'un re-introduit `EventCard` ou les cles i18n
 * `event1.*` / `event2.*`, le test echoue.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGE_SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

describe('landing page hero cleanup (P6.x.4-a-nonies)', () => {
  it('ne reference plus le composant EventCard (supprime du hero)', () => {
    expect(PAGE_SOURCE).not.toMatch(/EventCard/);
  });

  it("n'utilise plus les cles i18n home.event1.* / home.event2.* dans le hero", () => {
    expect(PAGE_SOURCE).not.toMatch(/event1\.title/);
    expect(PAGE_SOURCE).not.toMatch(/event2\.title/);
    expect(PAGE_SOURCE).not.toMatch(/event1\.date/);
    expect(PAGE_SOURCE).not.toMatch(/event2\.date/);
  });

  it('integre toujours <EtapesSection /> (source unique des 3 etapes 2026)', () => {
    expect(PAGE_SOURCE).toMatch(/<EtapesSection \/>/);
  });
});
