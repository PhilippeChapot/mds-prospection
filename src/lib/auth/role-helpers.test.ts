/**
 * @vitest-environment node
 *
 * P7.x.1.F-ter — tests role helpers (pures).
 */

import { describe, it, expect } from 'vitest';
import { hasAdminAccess, isSuperAdmin, isSalesOnly, ADMIN_ROLES } from './role-helpers';

describe('hasAdminAccess (P7.x.1.F-ter)', () => {
  it("'admin' -> true", () => {
    expect(hasAdminAccess('admin')).toBe(true);
  });

  it("'super_admin' -> true (le bug initial P7.x.1.F bloquait ce cas)", () => {
    expect(hasAdminAccess('super_admin')).toBe(true);
  });

  it("'sales' -> false", () => {
    expect(hasAdminAccess('sales')).toBe(false);
  });

  it('role inconnu / null / undefined / "" -> false', () => {
    expect(hasAdminAccess('viewer')).toBe(false);
    expect(hasAdminAccess(null)).toBe(false);
    expect(hasAdminAccess(undefined)).toBe(false);
    expect(hasAdminAccess('')).toBe(false);
  });
});

describe('isSuperAdmin (P7.x.1.F-ter)', () => {
  it("'super_admin' -> true", () => {
    expect(isSuperAdmin('super_admin')).toBe(true);
  });

  it("'admin' -> false (admin sans le suffixe super)", () => {
    expect(isSuperAdmin('admin')).toBe(false);
  });

  it('autres -> false', () => {
    expect(isSuperAdmin('sales')).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin('')).toBe(false);
  });
});

describe('isSalesOnly (P7.x.1.F-ter)', () => {
  it("'sales' -> true", () => {
    expect(isSalesOnly('sales')).toBe(true);
  });

  it("'admin' et 'super_admin' -> false (pas sales)", () => {
    expect(isSalesOnly('admin')).toBe(false);
    expect(isSalesOnly('super_admin')).toBe(false);
  });
});

describe('ADMIN_ROLES const (P7.x.1.F-ter)', () => {
  it('contient admin + super_admin (PAS sales)', () => {
    expect([...ADMIN_ROLES]).toEqual(['admin', 'super_admin']);
  });
});
