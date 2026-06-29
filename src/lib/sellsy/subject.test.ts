import { describe, it, expect } from 'vitest';
import { buildSellsySubject } from './subject';

const BASE = 'MediaDays Solutions / Paris Radio Show';

describe('buildSellsySubject', () => {
  it('fallback minimum : préfixe seul quand aucun détail', () => {
    expect(buildSellsySubject({})).toBe(BASE);
  });

  it('null explicite sur tous les champs → fallback minimum', () => {
    expect(
      buildSellsySubject({ stand_code: null, pack_name: null } as Parameters<
        typeof buildSellsySubject
      >[0]),
    ).toBe(BASE);
    expect(buildSellsySubject({ boothAssignment: null, packCode: null, items: [] })).toBe(BASE);
  });

  it('stand seul → préfixe + Stand', () => {
    expect(buildSellsySubject({ boothAssignment: 'F4' })).toBe(`${BASE} — Stand F4`);
  });

  it('pack seul via packCode → préfixe + Pack', () => {
    expect(buildSellsySubject({ packCode: 'CLASSIC' })).toBe(`${BASE} — Pack CLASSIC`);
  });

  it('pack via items.category=pack → préfixe + Pack (nom lisible)', () => {
    expect(buildSellsySubject({ items: [{ category: 'pack', name: 'Pack CLASSIC' }] })).toBe(
      `${BASE} — Pack CLASSIC`,
    );
  });

  it('stand + pack → préfixe + Stand + Pack', () => {
    expect(
      buildSellsySubject({
        boothAssignment: 'F4',
        items: [{ category: 'pack', name: 'Pack CLASSIC' }],
      }),
    ).toBe(`${BASE} — Stand F4 — Pack CLASSIC`);
  });

  it('items.pack prioritaire sur packCode quand les deux sont présents', () => {
    expect(
      buildSellsySubject({
        packCode: 'CLASSIC',
        items: [{ category: 'pack', name: 'Pack PREMIUM' }],
      }),
    ).toBe(`${BASE} — Pack PREMIUM`);
  });

  it('fallback packCode si item pack sans nom', () => {
    expect(
      buildSellsySubject({
        packCode: 'DUO',
        boothAssignment: 'C2',
        items: [{ category: 'option', name: 'Logo' }],
      }),
    ).toBe(`${BASE} — Stand C2 — Pack DUO`);
  });

  it('trim les espaces sur booth et pack name', () => {
    expect(
      buildSellsySubject({
        boothAssignment: '  F4  ',
        items: [{ category: 'pack', name: '  Pack CLASSIC  ' }],
      }),
    ).toBe(`${BASE} — Stand F4 — Pack CLASSIC`);
  });
});
