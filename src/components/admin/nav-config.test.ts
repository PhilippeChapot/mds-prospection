/**
 * @vitest-environment node
 *
 * P6.x.3-bis — regression sur la suppression de l'entree "Plan Canva (P2)"
 * dans la sidebar admin. Le toggle Grid/Plan est desormais integre dans
 * /admin/emplacements, donc l'entree dediee n'a plus de raison d'etre.
 */

import { describe, it, expect } from 'vitest';
import { ADMIN_NAV_SECTIONS, filterNavSectionsForRole } from './nav-config';

describe('ADMIN_NAV_SECTIONS (P6.x.3-bis)', () => {
  it("ne contient plus d'entree 'Plan Canva' / href '/admin/booths/plan'", () => {
    const allItems = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);
    expect(allItems.find((i) => i.href === '/admin/booths/plan')).toBeUndefined();
    expect(allItems.find((i) => i.label === 'Plan Canva')).toBeUndefined();
  });

  it("conserve l'entree 'Emplacements' (la seule porte d'entree salle + plan)", () => {
    const allItems = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);
    const emplacements = allItems.find((i) => i.href === '/admin/emplacements');
    expect(emplacements).toBeDefined();
    expect(emplacements?.enabled).toBe(true);
  });
});

describe('filterNavSectionsForRole (P5.x.1-quater bug #2)', () => {
  it('super_admin voit TOUS les items (aucun filtre)', () => {
    const filtered = filterNavSectionsForRole(ADMIN_NAV_SECTIONS, 'super_admin');
    const totalOriginal = ADMIN_NAV_SECTIONS.reduce((n, s) => n + s.items.length, 0);
    const totalFiltered = filtered.reduce((n, s) => n + s.items.length, 0);
    expect(totalFiltered).toBe(totalOriginal);
  });

  it('admin voit tout sauf les items super_admin only (Utilisateurs, Tokens MCP)', () => {
    const filtered = filterNavSectionsForRole(ADMIN_NAV_SECTIONS, 'admin');
    const allHrefs = filtered.flatMap((s) => s.items.map((i) => i.href));
    expect(allHrefs).not.toContain('/admin/users');
    expect(allHrefs).not.toContain('/admin/mcp-tokens');
    // Mais bien Préférences, Logs sync, Audit log, etc.
    expect(allHrefs).toContain('/admin/preferences');
    expect(allHrefs).toContain('/admin/audit-log');
  });

  it('sales voit EXACTEMENT 9 items (Dashboard, Prospects, Societes, Contacts, Smart Add, Messages, Inscriptions, Emplacements, Catalogue Sellsy)', () => {
    // P9.1-natif : +Messages (visitor messages) accessibles a tous les
    // admin/sales/super_admin (RBAC large car Sales doit pouvoir
    // repondre aux leads visiteurs entrants).
    const filtered = filterNavSectionsForRole(ADMIN_NAV_SECTIONS, 'sales');
    const hrefs = filtered.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toEqual([
      '/admin',
      '/admin/prospects',
      '/admin/companies',
      '/admin/contacts',
      '/admin/contacts/quick-add',
      '/admin/messages',
      '/admin/signups',
      '/admin/emplacements',
      '/admin/sellsy-products',
    ]);
    expect(hrefs).toHaveLength(9);
  });

  it('sales NE voit AUCUN item masque (Sync Brevo, Tarifs, Affilies, Preferences, Users, Logs sync, Audit, MCP, Styleguide, Saisons, Profils, Ressources, Claims)', () => {
    const filtered = filterNavSectionsForRole(ADMIN_NAV_SECTIONS, 'sales');
    const hrefs = filtered.flatMap((s) => s.items.map((i) => i.href));
    const forbidden = [
      '/admin/contacts-sync',
      '/admin/tarifs',
      '/admin/affiliates',
      '/admin/affiliate-claims',
      '/admin/exhibitors-profiles',
      '/admin/exhibitor-resources',
      '/admin/preferences',
      '/admin/seasons',
      '/admin/users',
      '/admin/sync-logs',
      '/admin/audit-log',
      '/admin/mcp-tokens',
      '/admin/styleguide',
    ];
    for (const f of forbidden) {
      expect(hrefs).not.toContain(f);
    }
  });

  it('sales : sections totalement masquees sont retirees (Croissance, Reglages, Dev)', () => {
    const filtered = filterNavSectionsForRole(ADMIN_NAV_SECTIONS, 'sales');
    const titles = filtered.map((s) => s.title);
    expect(titles).not.toContain('Croissance');
    expect(titles).not.toContain('Reglages');
    expect(titles).not.toContain('Dev');
    expect(titles).toContain('Pipeline');
    expect(titles).toContain('Salon');
  });
});
