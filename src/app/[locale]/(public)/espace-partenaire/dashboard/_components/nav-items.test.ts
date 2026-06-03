/**
 * P5.x.17 — sanity tests sur la config navigation Espace Contact.
 * P6.x.1b — étendu à 6 sections (ajout 'commander').
 * P3.1   — étendu à 8 sections (ajout 'ressources').
 * P9.2   — étendu à 9 sections (ajout 'messages').
 * P8.2   — étendu à 11 sections (ajout 'profil' + 'preferences-email')
 *          + filtrage dynamique par profil.
 *
 * Garanties testees :
 *   - 11 sections (full menu pour partenaire)
 *   - segments uniques (eviter de mapper 2 items sur la meme URL)
 *   - DEFAULT_EXPOSANT_SECTION pointe sur un segment connu
 *   - chaque labelKey est unique
 *   - filterNavItemsForProfile : contact simple voit 4 sections seulement
 *   - filterNavItemsForProfile : partenaire voit toutes les sections
 *   - filterNavItemsForProfile : lead voit profil/prefs/coordonnees/...
 */

import { describe, it, expect } from 'vitest';
import {
  EXPOSANT_NAV_ITEMS,
  DEFAULT_EXPOSANT_SECTION,
  filterNavItemsForProfile,
} from './nav-items';
import type { ContactProfile } from '@/lib/espace-partenaire/detect-profile';

function makeProfile(over: Partial<ContactProfile> = {}): ContactProfile {
  return {
    contact_id: 'c1',
    email: 'x@y.fr',
    first_name: null,
    last_name: null,
    language: 'FR',
    company_id: null,
    company_name: null,
    is_partenaire: false,
    is_lead: false,
    is_affiliate: false,
    is_partner: false,
    has_stand: false,
    active_prospect_id: null,
    ...over,
  };
}

describe('EXPOSANT_NAV_ITEMS', () => {
  it('expose 11 sections (full menu partenaire incl. profil + preferences-email)', () => {
    expect(EXPOSANT_NAV_ITEMS).toHaveLength(11);
  });

  it('chaque segment est unique', () => {
    const segments = EXPOSANT_NAV_ITEMS.map((i) => i.segment);
    expect(new Set(segments).size).toBe(segments.length);
  });

  it('chaque labelKey est unique', () => {
    const keys = EXPOSANT_NAV_ITEMS.map((i) => i.labelKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('contient les 11 segments attendus (P8.2 = +profil + preferences-email)', () => {
    const segments = EXPOSANT_NAV_ITEMS.map((i) => i.segment).sort();
    expect(segments).toEqual([
      'commander',
      'commandes',
      'coordonnees',
      'documents',
      'invitations',
      'kit-communication',
      'messages',
      'preferences-email',
      'profil',
      'ressources',
      'stand',
    ]);
  });

  it('DEFAULT_EXPOSANT_SECTION pointe sur un segment connu', () => {
    const segments = EXPOSANT_NAV_ITEMS.map((i) => i.segment);
    expect(segments).toContain(DEFAULT_EXPOSANT_SECTION);
  });

  it('chaque item a un emoji non vide', () => {
    for (const item of EXPOSANT_NAV_ITEMS) {
      expect(item.emoji.length).toBeGreaterThan(0);
    }
  });
});

describe('filterNavItemsForProfile (P8.2)', () => {
  it('contact simple (aucun flag) -> 4 sections (profil, preferences-email, ressources, messages)', () => {
    const items = filterNavItemsForProfile(EXPOSANT_NAV_ITEMS, makeProfile());
    const segments = items.map((i) => i.segment).sort();
    expect(segments).toEqual(['messages', 'preferences-email', 'profil', 'ressources']);
  });

  it('partenaire : voit toutes les sections (11)', () => {
    const items = filterNavItemsForProfile(
      EXPOSANT_NAV_ITEMS,
      makeProfile({ is_partenaire: true, has_stand: true }),
    );
    expect(items.length).toBe(11);
  });

  it('lead : voit profil/prefs/coordonnees/ressources/messages (pas stand/documents)', () => {
    const items = filterNavItemsForProfile(EXPOSANT_NAV_ITEMS, makeProfile({ is_lead: true }));
    const segments = items.map((i) => i.segment);
    expect(segments).toContain('coordonnees'); // lead+expo
    expect(segments).toContain('profil');
    expect(segments).toContain('preferences-email');
    expect(segments).not.toContain('stand'); // expo only
    expect(segments).not.toContain('documents'); // expo only
  });

  it('profile null (cas edge erreur) -> 4 sections always-on', () => {
    const items = filterNavItemsForProfile(EXPOSANT_NAV_ITEMS, null);
    expect(items.map((i) => i.segment).sort()).toEqual([
      'messages',
      'preferences-email',
      'profil',
      'ressources',
    ]);
  });
});
