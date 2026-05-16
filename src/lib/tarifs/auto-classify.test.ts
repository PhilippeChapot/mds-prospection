/**
 * P6.x.1a-quater — tests classifyByReference.
 *
 * Toutes les références testées sont VRAIES (auditées sur la DB le
 * 2026-05-16, 36 SKUs MDS-* actifs).
 */

import { describe, it, expect } from 'vitest';
import { classifyByReference, getClassificationRules } from './auto-classify';

describe('classifyByReference', () => {
  describe('PACK Paris (références réelles)', () => {
    it.each([
      ['MDS-PACK-STD-ACCESS-PARIS', 'pack', 'standard'],
      ['MDS-PACK-STD-CLASSIC-PARIS', 'pack', 'standard'],
      ['MDS-PACK-STD-PREMIUM-PARIS', 'pack', 'standard'],
      ['MDS-PACK-PRSEXH-ACCESS-PARIS', 'pack', 'prs'],
      ['MDS-PACK-PRSEXH-CLASSIC-PARIS', 'pack', 'prs'],
      ['MDS-PACK-PRSEXH-PREMIUM-PARIS', 'pack', 'prs'],
    ])('%s → %s / %s', (ref, cat, sub) => {
      const r = classifyByReference(ref);
      expect(r?.category).toBe(cat);
      expect(r?.sub_category).toBe(sub);
      expect(r?.confidence).toBe('high');
    });
  });

  describe('Compléments Marseille → pack/marseille_*', () => {
    it.each([
      ['MDS-OPT-STD-ACCESS-MARSEILLE', 'pack', 'marseille_std'],
      ['MDS-OPT-STD-CLASSIC-MARSEILLE', 'pack', 'marseille_std'],
      ['MDS-OPT-STD-PREMIUM-MARSEILLE', 'pack', 'marseille_std'],
      ['MDS-OPT-PRSEXH-ACCESS-MARSEILLE', 'pack', 'marseille_prs'],
      ['MDS-OPT-PRSEXH-CLASSIC-MARSEILLE', 'pack', 'marseille_prs'],
      ['MDS-OPT-PRSEXH-PREMIUM-MARSEILLE', 'pack', 'marseille_prs'],
    ])('%s → %s / %s', (ref, cat, sub) => {
      const r = classifyByReference(ref);
      expect(r?.category).toBe(cat);
      expect(r?.sub_category).toBe(sub);
    });
  });

  describe('Sponsors', () => {
    it.each([
      ['MDS-ADDON-LOGO-GOLD-PARIS', 'sponsor', 'or'],
      ['MDS-ADDON-LOGO-SILVER-PARIS', 'sponsor', 'argent'],
      ['MDS-ADDON-LANYARDS-1000-PARIS', 'sponsor', 'lanyards'],
      ['MDS-ADDON-PUBRE-LALETTRE-PRO-PARIS', 'sponsor', 'pub_redactionnelle'],
    ])('%s → %s / %s', (ref, cat, sub) => {
      const r = classifyByReference(ref);
      expect(r?.category).toBe(cat);
      expect(r?.sub_category).toBe(sub);
    });

    it('LOGO inconnu → sponsor / null (confidence medium)', () => {
      const r = classifyByReference('MDS-ADDON-LOGO-DIAMOND-PARIS');
      expect(r?.category).toBe('sponsor');
      expect(r?.sub_category).toBeNull();
      expect(r?.confidence).toBe('medium');
    });
  });

  describe('Options techniques', () => {
    it.each([
      ['MDS-ADDON-WIRED-2MBPS-PARIS', 'option', 'wifi'],
      ['MDS-ADDON-WIRED-6MBPS-PARIS', 'option', 'wifi'],
      ['MDS-ADDON-WIFI-EXPERT-PARIS', 'option', 'wifi'],
      ['MDS-ADDON-WIFI-SPONSOR-PARIS', 'option', 'wifi'],
      ['MDS-ADDON-ELEC-6KW-PARIS', 'option', 'elec'],
      ['MDS-ADDON-SCREEN-43-PARIS', 'option', 'ecran'],
      ['MDS-ADDON-SCREEN-55-PARIS', 'option', 'ecran'],
      ['MDS-ADDON-PANEL-1X2-PARIS', 'option', 'panneau'],
      ['MDS-ADDON-PANEL-2X2-PARIS', 'option', 'panneau'],
      ['MDS-ADDON-VISUEL-ACCESS-PARIS', 'option', 'visuel'],
      ['MDS-ADDON-VISUEL-CLASSIC-PARIS', 'option', 'visuel'],
      ['MDS-ADDON-KAKEMONO-PACK-PARIS', 'option', 'kakemono'],
    ])('%s → %s / %s', (ref, cat, sub) => {
      const r = classifyByReference(ref);
      expect(r?.category).toBe(cat);
      expect(r?.sub_category).toBe(sub);
    });
  });

  describe('Services', () => {
    it.each([
      ['MDS-ADDON-EMAIL-BLAST-CONNECTONAIR-PARIS', 'service', 'emailing'],
      ['MDS-ADDON-CASINO-PLACE-PARIS', 'service', 'casino'],
      ['MDS-ADDON-CASINO-TABLE-PARIS', 'service', 'casino'],
      ['MDS-ADDON-DEJEUNER-VIP-PLACE-PARIS', 'service', 'dejeuner'],
      ['MDS-ADDON-MASTERCLASS-CLASSIC-PRS-PARIS', 'service', 'masterclass'],
      ['MDS-ADDON-MASTERCLASS-CLASSIC-STD-PARIS', 'service', 'masterclass'],
      ['MDS-ADDON-PRIVATE-ROOM-1H-PARIS', 'service', 'private_room'],
      ['MDS-ADDON-VIP-SUPPLIER-PARIS', 'service', 'vip'],
    ])('%s → %s / %s', (ref, cat, sub) => {
      const r = classifyByReference(ref);
      expect(r?.category).toBe(cat);
      expect(r?.sub_category).toBe(sub);
    });
  });

  describe('Fallback ADDON inconnu → autre', () => {
    it('addon non répertorié → autre (confidence low)', () => {
      const r = classifyByReference('MDS-ADDON-MYSTERY-XYZ-PARIS');
      expect(r?.category).toBe('autre');
      expect(r?.sub_category).toBeNull();
      expect(r?.confidence).toBe('low');
    });
  });

  describe('Edge cases', () => {
    it('null → null', () => {
      expect(classifyByReference(null)).toBeNull();
    });
    it('undefined → null', () => {
      expect(classifyByReference(undefined)).toBeNull();
    });
    it('empty string → null', () => {
      expect(classifyByReference('')).toBeNull();
    });
    it('non-MDS reference → null (pas de fallback hors prefix)', () => {
      expect(classifyByReference('FOOBAR-123')).toBeNull();
    });
    it('case-insensitive', () => {
      expect(classifyByReference('mds-pack-std-access-paris')?.category).toBe('pack');
    });
  });

  describe('getClassificationRules', () => {
    it('exposes rules array (for debug UI)', () => {
      const rules = getClassificationRules();
      expect(rules.length).toBeGreaterThan(20);
      expect(rules[0]).toHaveProperty('pattern');
      expect(rules[0]).toHaveProperty('category');
    });
  });
});
