/**
 * @vitest-environment node
 *
 * P6.x.3-ter — tests sanitizer RGPD : ne JAMAIS exposer contact_email
 * (PII) dans les props sérialisées côté Client Component partenaire.
 *
 * C'est un test de défense en profondeur : le but est de garantir que tout
 * futur refactor qui ré-ajouterait `contact_email` à l'output sera capturé
 * par CI au lieu de leaker en prod.
 */

import { describe, it, expect } from 'vitest';
import { toStandPublicView, toStandPublicViewList } from './stands-public-view';
import type { StandWithProspect } from '@/lib/admin/stands/queries';

function makeStandWithEmail(): StandWithProspect {
  return {
    id: 'stand-1',
    number: 'A1',
    salle: 'le_notre',
    taille_m2: 9,
    pole_recommended: null,
    status: 'paye',
    prospect_id: 'p-1',
    notes: null,
    position_x: 10,
    position_y: 20,
    position_w: 6,
    position_h: 8,
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
    prospect: {
      id: 'p-1',
      status: 'paye',
      company_name: 'Radio France',
      company_public_visibility: true,
      contact_email: 'secret@radiofrance.fr',
    },
  };
}

describe('toStandPublicView (RGPD sanitizer)', () => {
  it('strip contact_email du payload exposé côté client', () => {
    const input = makeStandWithEmail();
    const out = toStandPublicView(input);
    expect(out.prospect).not.toBeNull();
    // Pas de contact_email ni dans la racine ni dans prospect
    const serialized = JSON.stringify(out);
    expect(serialized).not.toMatch(/secret@radiofrance\.fr/);
    expect(serialized).not.toMatch(/contact_email/);
  });

  it('conserve les champs publics utiles (name + visibility + position)', () => {
    const input = makeStandWithEmail();
    const out = toStandPublicView(input);
    expect(out.prospect?.company_name).toBe('Radio France');
    expect(out.prospect?.company_public_visibility).toBe(true);
    expect(out.position_x).toBe(10);
    expect(out.taille_m2).toBe(9);
  });

  it('stand sans prospect -> prospect null preservé', () => {
    const input: StandWithProspect = { ...makeStandWithEmail(), prospect: null, status: 'libre' };
    const out = toStandPublicView(input);
    expect(out.prospect).toBeNull();
  });

  it('toStandPublicViewList map sur un tableau', () => {
    const list = [makeStandWithEmail(), makeStandWithEmail()];
    const out = toStandPublicViewList(list);
    expect(out).toHaveLength(2);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toMatch(/contact_email/);
  });
});
