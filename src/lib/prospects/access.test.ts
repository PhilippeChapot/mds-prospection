/**
 * P5.x.1-quater-bis (bug #3) — tests de la matrice d'acces prospect.
 *
 * Garde-fou critique : super_admin + admin doivent continuer a voir
 * TOUS les prospects (regression critique).
 */

import { describe, it, expect } from 'vitest';
import { canViewProspectDetail } from './access';

const SELF = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('canViewProspectDetail (P5.x.1-quater-bis bug #3)', () => {
  it('super_admin voit TOUS les prospects (regression critique)', () => {
    expect(
      canViewProspectDetail({ userRole: 'super_admin', userId: SELF, prospectOwnerId: OTHER }),
    ).toBe(true);
    expect(
      canViewProspectDetail({ userRole: 'super_admin', userId: SELF, prospectOwnerId: SELF }),
    ).toBe(true);
    expect(
      canViewProspectDetail({ userRole: 'super_admin', userId: SELF, prospectOwnerId: null }),
    ).toBe(true);
  });

  it('admin voit TOUS les prospects (regression critique)', () => {
    expect(canViewProspectDetail({ userRole: 'admin', userId: SELF, prospectOwnerId: OTHER })).toBe(
      true,
    );
    expect(canViewProspectDetail({ userRole: 'admin', userId: SELF, prospectOwnerId: SELF })).toBe(
      true,
    );
    expect(canViewProspectDetail({ userRole: 'admin', userId: SELF, prospectOwnerId: null })).toBe(
      true,
    );
  });

  it('sales voit ses propres prospects (owner_id == self)', () => {
    expect(canViewProspectDetail({ userRole: 'sales', userId: SELF, prospectOwnerId: SELF })).toBe(
      true,
    );
  });

  it("sales NE voit PAS les prospects d'un autre Sales (owner_id != self)", () => {
    expect(canViewProspectDetail({ userRole: 'sales', userId: SELF, prospectOwnerId: OTHER })).toBe(
      false,
    );
  });

  it('sales NE voit PAS les prospects non assignes (owner_id == null, V1 strict)', () => {
    expect(canViewProspectDetail({ userRole: 'sales', userId: SELF, prospectOwnerId: null })).toBe(
      false,
    );
  });
});
