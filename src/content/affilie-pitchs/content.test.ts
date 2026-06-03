/**
 * P7.x.AffiliePitchsAndChat — tests integrite contenu pitchs.
 */

import { describe, it, expect } from 'vitest';
import { AFFILIE_CONTENT_FR, AFFILIE_CONTENT_EN, getAffilieContent } from './content';

describe('AFFILIE_CONTENT_FR (P7.x.AffiliePitchsAndChat)', () => {
  const c = AFFILIE_CONTENT_FR;

  it('contient toutes les sections obligatoires', () => {
    expect(c.hero.title).toBeTruthy();
    expect(c.hero.subtitle).toBeTruthy();
    expect(c.hero.intro).toContain('MediaDays Solutions');
    expect(c.pitch20s.title).toMatch(/20 secondes/i);
    expect(c.pitch20s.text).toContain('MediaDays Solutions');
    expect(c.poles.items).toHaveLength(5);
    expect(c.cities.items).toHaveLength(3);
    expect(c.arguments.items).toHaveLength(4);
    expect(c.classic_comparison.table.rows.length).toBeGreaterThanOrEqual(3);
    expect(c.objections.items).toHaveLength(4);
    expect(c.how_to_conclude.steps.length).toBeGreaterThanOrEqual(3);
    expect(c.closing_line.text).toBeTruthy();
  });

  it('5 poles avec emoji + label + description', () => {
    for (const p of c.poles.items) {
      expect(p.emoji.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(10);
    }
    expect(c.poles.items.map((p) => p.label)).toEqual([
      'Audio & Radio',
      'Vidéo & CTV',
      'Outdoor & DOOH',
      'Diffusion & Infra',
      'Data & Adtech',
    ]);
  });

  it('3 villes : Marseille, Paris (flagship), Bruxelles', () => {
    const cities = c.cities.items.map((x) => x.city);
    expect(cities).toEqual(['Marseille', 'Paris', 'Bruxelles']);
    const paris = c.cities.items.find((x) => x.city === 'Paris');
    expect(paris?.tag).toBeTruthy();
  });

  it('table comparison Solutions vs Classic avec affiliation correctement marquée', () => {
    const affRow = c.classic_comparison.table.rows.find((r) =>
      r.label.toLowerCase().includes('affiliation'),
    );
    expect(affRow?.solutions).toContain('OUI');
    expect(affRow?.classic).toContain('NON');
  });

  it('aucun placeholder TODO / xxx / FIXME dans le contenu', () => {
    const raw = JSON.stringify(c);
    expect(raw).not.toMatch(/TODO/i);
    expect(raw).not.toMatch(/xxx/i);
    expect(raw).not.toMatch(/FIXME/i);
    expect(raw).not.toMatch(/lorem ipsum/i);
  });
});

describe('AFFILIE_CONTENT_EN (P7.x.AffiliePitchsAndChat)', () => {
  const c = AFFILIE_CONTENT_EN;

  it('miroir EN du FR avec memes shape', () => {
    expect(c.poles.items).toHaveLength(5);
    expect(c.cities.items).toHaveLength(3);
    expect(c.arguments.items).toHaveLength(4);
    expect(c.objections.items).toHaveLength(4);
  });

  it('cities EN : Brussels (pas Bruxelles)', () => {
    const cities = c.cities.items.map((x) => x.city);
    expect(cities).toContain('Brussels');
    expect(cities).not.toContain('Bruxelles');
  });

  it('aucun placeholder', () => {
    const raw = JSON.stringify(c);
    expect(raw).not.toMatch(/TODO/i);
    expect(raw).not.toMatch(/FIXME/i);
    expect(raw).not.toMatch(/lorem ipsum/i);
  });
});

describe('getAffilieContent (P7.x.AffiliePitchsAndChat)', () => {
  it('locale=fr -> FR content', () => {
    expect(getAffilieContent('fr').hero.title).toBe(AFFILIE_CONTENT_FR.hero.title);
  });
  it('locale=en -> EN content', () => {
    expect(getAffilieContent('en').hero.title).toBe(AFFILIE_CONTENT_EN.hero.title);
  });
});
