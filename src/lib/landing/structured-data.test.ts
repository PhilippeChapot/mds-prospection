/**
 * @vitest-environment node
 *
 * SEO — Structured Data JSON-LD landing (Organization, WebSite, 3x BusinessEvent).
 */

import { describe, it, expect } from 'vitest';
import { LANDING_JSON_LD } from './structured-data';

describe('LANDING_JSON_LD', () => {
  it('contient une entite Organization', () => {
    const org = LANDING_JSON_LD.find((entity) => entity['@type'] === 'Organization');
    expect(org).toBeDefined();
    expect(org?.name).toBe('MediaDays Solutions');
  });

  it('contient une entite WebSite', () => {
    const website = LANDING_JSON_LD.find((entity) => entity['@type'] === 'WebSite');
    expect(website).toBeDefined();
  });

  it("l'evenement Paris a la bonne date et le bon lieu", () => {
    const paris = LANDING_JSON_LD.find(
      (entity) => entity['@type'] === 'BusinessEvent' && entity.name === 'MediaDays Paris 2026',
    );
    expect(paris).toBeDefined();
    expect(paris?.startDate).toBe('2026-12-15T09:00:00+01:00');
    expect(paris?.location?.name).toBe('Carrousel du Louvre');
  });

  it('contient les 3 BusinessEvent (Paris, Marseille, Bruxelles)', () => {
    const events = LANDING_JSON_LD.filter((entity) => entity['@type'] === 'BusinessEvent');
    expect(events.map((e) => e.name).sort()).toEqual(
      ['MediaDays Bruxelles 2026', 'MediaDays Marseille 2026', 'MediaDays Paris 2026'].sort(),
    );
  });
});
