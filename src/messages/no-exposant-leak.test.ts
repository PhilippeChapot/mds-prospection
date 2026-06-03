/**
 * P11.x.Rebrand — anti-regression : aucune occurrence du mot "Exposant" /
 * "Exhibitor" ne doit s afficher dans l UI bilingue (messages/fr.json + en.json).
 *
 * Les KEYS i18n peuvent garder leur nom historique (espaceExposant.foo,
 * ctaExhibitor, etc.) pour backward compat des call sites — seules les
 * VALUES affichees a l utilisateur doivent etre nettoyees.
 */

import { describe, it, expect } from 'vitest';
import fr from './fr.json';
import en from './en.json';

const FR_EXCEPTIONS: RegExp[] = [
  // Aucune exception V1 — toutes les values FR doivent etre "Partenaire".
];
const EN_EXCEPTIONS: RegExp[] = [
  // Aucune exception V1 — toutes les values EN doivent etre "Partner".
];

function collectStringValues(obj: unknown, path = ''): Array<{ path: string; value: string }> {
  const out: Array<{ path: string; value: string }> = [];
  if (typeof obj === 'string') {
    out.push({ path, value: obj });
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => out.push(...collectStringValues(v, `${path}[${i}]`)));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      out.push(...collectStringValues(v, path ? `${path}.${k}` : k));
    }
  }
  return out;
}

describe('i18n FR no-exposant-leak (P11.x.Rebrand)', () => {
  it('aucune VALUE i18n FR ne contient le mot Exposant / exposant', () => {
    const all = collectStringValues(fr);
    const leaks = all.filter(({ value }) => {
      if (FR_EXCEPTIONS.some((re) => re.test(value))) return false;
      return /\b[Ee]xposants?\b/.test(value);
    });
    if (leaks.length > 0) {
      console.warn('FR leaks:', leaks.slice(0, 10));
    }
    expect(leaks).toHaveLength(0);
  });
});

describe('i18n EN no-exhibitor-leak (P11.x.Rebrand)', () => {
  it('aucune VALUE i18n EN ne contient le mot Exhibitor / exhibitor (hors DB)', () => {
    const all = collectStringValues(en);
    const leaks = all.filter(({ value }) => {
      if (EN_EXCEPTIONS.some((re) => re.test(value))) return false;
      // Exclure les contextes DB legitimes (prs_exhibitor, was_prs_2026_exhibitor)
      if (/prs_exhibitor|was_prs_2026_exhibitor/.test(value)) return false;
      return /\b[Ee]xhibitors?\b/.test(value);
    });
    if (leaks.length > 0) {
      console.warn('EN leaks:', leaks.slice(0, 10));
    }
    expect(leaks).toHaveLength(0);
  });
});

describe('Espace Partenaire branding (P11.x.Rebrand)', () => {
  it('FR contient bien "Espace Partenaire" quelque part', () => {
    const raw = JSON.stringify(fr);
    expect(raw).toMatch(/Espace Partenaire|Mon espace partenaire/i);
  });
  it('EN contient bien "Partner area" quelque part', () => {
    const raw = JSON.stringify(en);
    expect(raw).toMatch(/Partner area|partner space/i);
  });
});
