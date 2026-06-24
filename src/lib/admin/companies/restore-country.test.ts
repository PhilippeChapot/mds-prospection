/**
 * @vitest-environment node
 *
 * P5.x.RestoreCountryFromXlsx — normalizeName + matchCountry + ISO (purs).
 */

import { describe, it, expect } from 'vitest';
import { normalizeName, buildNameCountryIndex, matchCountry } from './restore-country';
import { normalizeCountryToIso } from '@/lib/format/country';

describe('normalizeName (P5.x)', () => {
  it('retire accents + espaces + ponctuation', () => {
    expect(normalizeName('Aéroports de Paris')).toBe('aeroportsdeparis');
    expect(normalizeName("L'Équipe")).toBe('lequipe');
    expect(normalizeName('  RADIO  FRANCE  ')).toBe('radiofrance');
    expect(normalizeName('21 Juin Production')).toBe('21juinproduction');
  });
});

describe('matchCountry (P5.x)', () => {
  const prospection = buildNameCountryIndex([
    { names: ['Radio France'], country: 'France' },
    { names: ['Smartevo'], country: 'France' },
  ]);
  const coa = buildNameCountryIndex([
    { names: ['Skyrock SA', 'Skyrock', 'SKY'], country: 'France' },
    { names: ['RTL Belgium', null, 'RTLBE'], country: 'Belgique' },
  ]);

  it('match Prospection_v2 prioritaire', () => {
    const m = matchCountry('RADIO FRANCE', prospection, coa);
    expect(m).toEqual({ rawCountry: 'France', source: 'prospection_v2' });
  });

  it('match ConnectOnAir via raison_social', () => {
    const m = matchCountry('Skyrock SA', prospection, coa);
    expect(m?.source).toBe('connectonair');
  });

  it('match ConnectOnAir via abrégé/sigle', () => {
    const m = matchCountry('RTLBE', prospection, coa);
    expect(m).toEqual({ rawCountry: 'Belgique', source: 'connectonair' });
  });

  it('aucun match → null', () => {
    expect(matchCountry('Société Inconnue XYZ', prospection, coa)).toBeNull();
  });
});

describe('normalizeCountryToIso — libellés FR du xlsx (P5.x)', () => {
  it('France → FR', () => expect(normalizeCountryToIso('France')).toBe('FR'));
  it('Grande Bretagne → GB', () => expect(normalizeCountryToIso('Grande Bretagne')).toBe('GB'));
  it('Cameroun → CM', () => expect(normalizeCountryToIso('Cameroun')).toBe('CM'));
  it('Burkina Faso → BF', () => expect(normalizeCountryToIso('Burkina Faso')).toBe('BF'));
  it('Côte d’Ivoire → CI', () => expect(normalizeCountryToIso("Côte d'Ivoire")).toBe('CI'));
  it('libellé inconnu → null', () => expect(normalizeCountryToIso('Atlantide')).toBeNull());
});
