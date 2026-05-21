/**
 * @vitest-environment node
 *
 * P6.x.3-bis — regression sur la suppression de l'entree "Plan Canva (P2)"
 * dans la sidebar admin. Le toggle Grid/Plan est desormais integre dans
 * /admin/emplacements, donc l'entree dediee n'a plus de raison d'etre.
 */

import { describe, it, expect } from 'vitest';
import { ADMIN_NAV_SECTIONS } from './nav-config';

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
