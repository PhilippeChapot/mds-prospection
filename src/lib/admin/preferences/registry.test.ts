/**
 * @vitest-environment node
 *
 * P2.x.1 — sanity tests sur SETTINGS_REGISTRY.
 *
 * Garanties testées :
 *   - Pas de doublon de key
 *   - Toutes les keys ont label/description/type/schema
 *   - Toutes les categories sont dans l'enum DB
 *   - validateSettingValue applique le schema Zod sur key connue
 *   - validateSettingValue passe sans validation sur key custom
 */

import { describe, it, expect } from 'vitest';
import {
  SETTINGS_REGISTRY,
  APP_SETTING_CATEGORIES,
  getSettingDef,
  getSettingsByCategory,
  validateSettingValue,
} from './registry';

describe('SETTINGS_REGISTRY (P2.x.1)', () => {
  it('pas de doublon de key', () => {
    const keys = SETTINGS_REGISTRY.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('chaque entrée a label/description/type/schema non vides', () => {
    for (const s of SETTINGS_REGISTRY) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.type).toBeTruthy();
      expect(s.schema).toBeDefined();
    }
  });

  it("toutes les catégories sont dans l'enum DB", () => {
    for (const s of SETTINGS_REGISTRY) {
      expect(APP_SETTING_CATEGORIES).toContain(s.category);
    }
  });

  it('getSettingDef trouve une key connue', () => {
    const def = getSettingDef('acompte_percent');
    expect(def?.category).toBe('finance');
    expect(def?.type).toBe('percent');
  });

  it('getSettingDef retourne undefined pour key inconnue', () => {
    expect(getSettingDef('foo_bar_does_not_exist')).toBeUndefined();
  });

  it('getSettingsByCategory filtre correctement', () => {
    const finance = getSettingsByCategory('finance');
    expect(finance.length).toBeGreaterThan(0);
    expect(finance.every((s) => s.category === 'finance')).toBe(true);
  });

  it('canva_md26_plan_url et admin_notification_emails sont en category general (préserve la prod)', () => {
    expect(getSettingDef('canva_md26_plan_url')?.category).toBe('general');
    expect(getSettingDef('admin_notification_emails')?.category).toBe('general');
  });
});

describe('validateSettingValue (P2.x.1)', () => {
  it('key connue + value valide -> ok', () => {
    const r = validateSettingValue('acompte_percent', 30);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(30);
  });

  it('key connue + value invalide (acompte > 100) -> ok:false', () => {
    const r = validateSettingValue('acompte_percent', 150);
    expect(r.ok).toBe(false);
  });

  it('key connue + type mismatch (string au lieu de number) -> ok:false', () => {
    const r = validateSettingValue('acompte_percent', '30');
    expect(r.ok).toBe(false);
  });

  it("email_list : array d'emails valides -> ok", () => {
    const r = validateSettingValue('admin_notification_emails', [
      'philippe@mediadays.solutions',
      'autre@example.com',
    ]);
    expect(r.ok).toBe(true);
  });

  it('email_list : array contient un non-email -> ok:false', () => {
    const r = validateSettingValue('admin_notification_emails', ['not-an-email']);
    expect(r.ok).toBe(false);
  });

  it('canva_md26_plan_url : URL vide OK (placeholder seed 0019)', () => {
    const r = validateSettingValue('canva_md26_plan_url', '');
    expect(r.ok).toBe(true);
  });

  it('canva_md26_plan_url : URL valide OK', () => {
    const r = validateSettingValue(
      'canva_md26_plan_url',
      'https://www.canva.com/design/DAHGZNYdF2Q/3qgDD2_2W3KQJWUe_JpHIg/view?embed',
    );
    expect(r.ok).toBe(true);
  });

  it('key custom (inconnue) -> ok sans validation', () => {
    const r = validateSettingValue('my_custom_random_key', { foo: 'bar', n: 42 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ foo: 'bar', n: 42 });
  });

  it('boolean schema : true OK, "true" string KO', () => {
    expect(validateSettingValue('feature_flag_affiliate_program', true).ok).toBe(true);
    expect(validateSettingValue('feature_flag_affiliate_program', 'true').ok).toBe(false);
  });
});
