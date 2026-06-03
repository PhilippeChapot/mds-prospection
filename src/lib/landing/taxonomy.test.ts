/**
 * P6.x.4-a — tests sanité du JSON taxonomie + accessors typés.
 *
 * Valide à la fois le résultat du parseur (généré par `pnpm
 * build:taxonomy`) ET la couche typée src/lib/landing/taxonomy.ts.
 */

import { describe, it, expect } from 'vitest';
import { getTaxonomy, getPoleByCode } from './taxonomy';

describe('mds-taxonomy.json (P6.x.4-a)', () => {
  const tax = getTaxonomy();

  it('contient exactement 6 pôles avec les codes attendus', () => {
    expect(tax.poles).toHaveLength(6);
    expect(tax.poles.map((p) => p.code).sort()).toEqual(
      [
        'AUDIO_RADIO',
        'DATA_ADTECH',
        'DIFFUSION_INFRA',
        'OUTDOOR_DOOH',
        'REGIES_RETAIL_MEDIA',
        'VIDEO_CTV',
      ].sort(),
    );
  });

  it('contient 14 familles visiteurs (id 1..14, count 245 total)', () => {
    expect(tax.visiteurs).toHaveLength(14);
    expect(new Set(tax.visiteurs.map((v) => v.id))).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
    );
    expect(tax.stats.total_visiteurs_entites).toBe(245);
  });

  it('totaux pôles = 69 sous-secteurs · 484 partenaires cibles (doc v2.1)', () => {
    expect(tax.stats.total_sous_secteurs).toBe(69);
    expect(tax.stats.total_partenaires_cibles).toBe(484);
  });

  it('famille 11 → institutionnel_form, famille 13 → ecole_form', () => {
    const f11 = tax.visiteurs.find((v) => v.id === 11);
    const f13 = tax.visiteurs.find((v) => v.id === 13);
    expect(f11?.action_landing).toBe('institutionnel_form');
    expect(f13?.action_landing).toBe('ecole_form');
  });

  it('P6.x.4-a-bis — toutes les autres familles → external_mediadays_net', () => {
    const others = tax.visiteurs.filter((v) => v.id !== 11 && v.id !== 13);
    for (const v of others) {
      expect(v.action_landing).toBe('external_mediadays_net');
    }
  });

  it('Régies & Retail Media = mediadays_classique, 5 autres pôles = mediadays_solutions', () => {
    const reg = getPoleByCode('REGIES_RETAIL_MEDIA');
    expect(reg?.category).toBe('mediadays_classique');
    for (const p of tax.poles) {
      if (p.code !== 'REGIES_RETAIL_MEDIA') {
        expect(p.category).toBe('mediadays_solutions');
      }
    }
  });

  it('Audio & Radio porte le sub_label "Paris Radio Show"', () => {
    expect(getPoleByCode('AUDIO_RADIO')?.sub_label).toBe('Paris Radio Show');
  });

  it('Annonceurs grands comptes (famille 1) a 4 affinités, RÉGIES en niveau 2', () => {
    const f1 = tax.visiteurs.find((v) => v.id === 1);
    expect(f1?.affinite_poles).toHaveLength(4);
    expect(f1?.affinite_poles[0]).toBe('REGIES_RETAIL_MEDIA');
    expect(f1?.affinite_levels[0]).toBe(2);
  });

  it('P6.x.4-a-ter — DIFFUSION & VIDÉO descriptions ne mentionnent plus aucun concurrent (SATIS)', () => {
    const diff = getPoleByCode('DIFFUSION_INFRA');
    expect(diff?.description).toContain('FM/DAB+/TNT/5G');
    expect(diff?.description).not.toMatch(/SATIS|concurrent/i);
    const video = getPoleByCode('VIDEO_CTV');
    expect(video?.description).not.toMatch(/SATIS|concurrence/i);
  });
});
