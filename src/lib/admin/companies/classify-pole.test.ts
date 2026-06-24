/**
 * @vitest-environment node
 *
 * P5.x.ApolloEnrichFixes — classifyCompanyToPole (Haiku mocké) + resolvePoleCode.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolvePoleCode, type ClassifyCompanyResult } from './classify-pole';

const state = { text: '' };

function mockAnthropic() {
  vi.doMock('@anthropic-ai/sdk', () => ({
    default: class {
      messages = {
        create: () =>
          Promise.resolve({
            content: [{ type: 'text', text: state.text }],
            usage: { input_tokens: 10, output_tokens: 10 },
          }),
      };
    },
  }));
}

beforeEach(() => {
  vi.resetModules(); // évite que le SDK chargé par un autre fichier masque le mock
  state.text = '';
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
});
afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('classifyCompanyToPole (P5.x)', () => {
  it('JSON valide → poleCode + confidence + reasoning', async () => {
    state.text =
      '{ "pole_code": "AUDIO_RADIO", "confidence": 0.92, "reasoning": "Plateforme podcast." }';
    mockAnthropic();
    const { classifyCompanyToPole } = await import('./classify-pole');
    const r = await classifyCompanyToPole({ name: 'Smartevo', industry: 'podcast' });
    expect(r?.poleCode).toBe('AUDIO_RADIO');
    expect(r?.confidence).toBe(0.92);
    expect(r?.reasoning).toContain('podcast');
  });

  it('pole_code invalide → null', async () => {
    state.text = '{ "pole_code": "FOOBAR", "confidence": 0.9 }';
    mockAnthropic();
    const { classifyCompanyToPole } = await import('./classify-pole');
    expect(await classifyCompanyToPole({ name: 'X' })).toBeNull();
  });

  it('réponse sans JSON → null', async () => {
    state.text = 'désolé je ne sais pas';
    mockAnthropic();
    const { classifyCompanyToPole } = await import('./classify-pole');
    expect(await classifyCompanyToPole({ name: 'X' })).toBeNull();
  });

  it('ANTHROPIC_API_KEY absent → null (best-effort)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    mockAnthropic();
    const { classifyCompanyToPole } = await import('./classify-pole');
    expect(await classifyCompanyToPole({ name: 'X' })).toBeNull();
  });

  it('confidence clampée [0,1]', async () => {
    state.text = '{ "pole_code": "DATA_ADTECH", "confidence": 5, "reasoning": "x" }';
    mockAnthropic();
    const { classifyCompanyToPole } = await import('./classify-pole');
    const r = await classifyCompanyToPole({ name: 'X' });
    expect(r?.confidence).toBe(1);
  });
});

describe('resolvePoleCode — seuil 0.7 (P5.x)', () => {
  const mk = (
    poleCode: ClassifyCompanyResult['poleCode'],
    confidence: number,
  ): ClassifyCompanyResult => ({
    poleCode,
    confidence,
    reasoning: '',
  });
  it('confidence >= 0.7 → pôle classé', () => {
    expect(resolvePoleCode(mk('AUDIO_RADIO', 0.8))).toBe('AUDIO_RADIO');
  });
  it('confidence < 0.7 → INCONNU', () => {
    expect(resolvePoleCode(mk('AUDIO_RADIO', 0.5))).toBe('INCONNU');
  });
  it('null → INCONNU', () => {
    expect(resolvePoleCode(null)).toBe('INCONNU');
  });
});
