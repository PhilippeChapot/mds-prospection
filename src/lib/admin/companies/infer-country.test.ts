/**
 * @vitest-environment node
 *
 * P5.x.InferMissingCountry — inferCompanyCountry (Haiku mocké) + décision.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldApplyInferredCountry, type InferCountryResult } from './infer-country';

const state = { text: '' };

function mockAnthropic() {
  vi.doMock('@anthropic-ai/sdk', () => ({
    default: class {
      messages = {
        create: () =>
          Promise.resolve({
            content: [{ type: 'text', text: state.text }],
            usage: { input_tokens: 5, output_tokens: 5 },
          }),
      };
    },
  }));
}

beforeEach(() => {
  vi.resetModules();
  state.text = '';
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
});
afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('inferCompanyCountry (P5.x)', () => {
  it('JSON valide → iso2 uppercase + confidence + reasoning', async () => {
    state.text = '{ "iso_2": "fr", "confidence": 0.95, "reasoning": "Domaine .fr, Paris." }';
    mockAnthropic();
    const { inferCompanyCountry } = await import('./infer-country');
    const r = await inferCompanyCountry({ name: 'Maddyness', primaryDomain: 'maddyness.com' });
    expect(r?.iso2).toBe('FR');
    expect(r?.confidence).toBe(0.95);
  });

  it('iso_2 invalide (nom complet) → null', async () => {
    state.text = '{ "iso_2": "France", "confidence": 0.9 }';
    mockAnthropic();
    const { inferCompanyCountry } = await import('./infer-country');
    expect(await inferCompanyCountry({ name: 'X' })).toBeNull();
  });

  it('réponse sans JSON → null', async () => {
    state.text = 'je ne sais pas';
    mockAnthropic();
    const { inferCompanyCountry } = await import('./infer-country');
    expect(await inferCompanyCountry({ name: 'X' })).toBeNull();
  });

  it('ANTHROPIC_API_KEY absent → null', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    mockAnthropic();
    const { inferCompanyCountry } = await import('./infer-country');
    expect(await inferCompanyCountry({ name: 'X' })).toBeNull();
  });
});

describe('shouldApplyInferredCountry — seuil + sentinelle (P5.x)', () => {
  const mk = (iso2: string, confidence: number): InferCountryResult => ({
    iso2,
    confidence,
    reasoning: '',
  });
  it('confidence >= 0.7 + ISO valide → applique', () => {
    expect(shouldApplyInferredCountry(mk('FR', 0.8))).toBe(true);
  });
  it('confidence < 0.7 → skip', () => {
    expect(shouldApplyInferredCountry(mk('FR', 0.5))).toBe(false);
  });
  it('XX (indéterminable) → skip même si confiant', () => {
    expect(shouldApplyInferredCountry(mk('XX', 0.9))).toBe(false);
  });
  it('null → skip', () => {
    expect(shouldApplyInferredCountry(null)).toBe(false);
  });
});
