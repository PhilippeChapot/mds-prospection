/**
 * P5.x.23 — tests parseInputWithAI (Claude Haiku).
 *
 * On mocke @anthropic-ai/sdk. Validation :
 *   - retourne null si ANTHROPIC_API_KEY manquant
 *   - retourne null si la réponse n'est pas du JSON parseable
 *   - retourne null si l'input est vide
 *   - retourne ParsedSmartAdd quand JSON valide
 *   - normalise email lower + country upper + suggested_pole fallback INCONNU
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_BACKUP = { ...process.env };

function mockAnthropic(text: string, usage = { input_tokens: 50, output_tokens: 30 }) {
  vi.doMock('@anthropic-ai/sdk', () => {
    return {
      default: class {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text }],
            usage,
          }),
        };
      },
    };
  });
}

describe('parseInputWithAI (P5.x.23)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    if (!ENV_BACKUP.ANTHROPIC_API_KEY) delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns null when ANTHROPIC_API_KEY missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { parseInputWithAI } = await import('./parse-with-ai');
    const result = await parseInputWithAI('some text');
    expect(result).toBeNull();
  });

  it('returns null on empty input', async () => {
    mockAnthropic('{}');
    const { parseInputWithAI } = await import('./parse-with-ai');
    const result = await parseInputWithAI('');
    expect(result).toBeNull();
  });

  it('returns null when AI response has no JSON', async () => {
    mockAnthropic('plain text no json here');
    const { parseInputWithAI } = await import('./parse-with-ai');
    const result = await parseInputWithAI('hello');
    expect(result).toBeNull();
  });

  it('parses valid JSON and normalizes fields', async () => {
    mockAnthropic(
      JSON.stringify({
        person: {
          first_name: 'Jean',
          last_name: 'Dupont',
          email: 'JEAN.DUPONT@ACME.FR',
          phone: '+33 1 23',
          role: 'CEO',
          linkedin_url: null,
        },
        company: {
          name: 'Acme',
          website: 'https://acme.fr',
          country: 'fr',
          primary_domain: 'ACME.FR',
          description: null,
          suggested_pole: 'AUDIO_RADIO',
        },
        confidence: 'high',
        notes: null,
      }),
    );
    const { parseInputWithAI } = await import('./parse-with-ai');
    const result = await parseInputWithAI('paste content');
    expect(result).not.toBeNull();
    expect(result?.person.email).toBe('jean.dupont@acme.fr');
    expect(result?.company.country).toBe('FR');
    expect(result?.company.primary_domain).toBe('acme.fr');
    expect(result?.company.suggested_pole).toBe('AUDIO_RADIO');
    expect(result?.confidence).toBe('high');
    expect(result?.tokensIn).toBe(50);
  });

  it('falls back to INCONNU for invalid suggested_pole', async () => {
    mockAnthropic(
      JSON.stringify({
        person: {
          first_name: null,
          last_name: null,
          email: null,
          phone: null,
          role: null,
          linkedin_url: null,
        },
        company: {
          name: 'X',
          website: null,
          country: null,
          primary_domain: null,
          description: null,
          suggested_pole: 'INVALID_CODE',
        },
        confidence: 'low',
        notes: null,
      }),
    );
    const { parseInputWithAI } = await import('./parse-with-ai');
    const result = await parseInputWithAI('input');
    expect(result?.company.suggested_pole).toBe('INCONNU');
  });

  it('extracts alternate_domains, normalizes, dedupes, filters primary', async () => {
    mockAnthropic(
      JSON.stringify({
        person: {
          first_name: null,
          last_name: null,
          email: null,
          phone: null,
          role: null,
          linkedin_url: null,
        },
        company: {
          name: 'France TV',
          website: 'https://www.francetv.fr',
          country: 'FR',
          primary_domain: 'francetv.fr',
          alternate_domains: [
            'https://www.francetelevisions.fr/',
            'francetv.fr', // doublon avec primary → doit être filtré
            'FRANCE.TV',
          ],
          description: null,
          suggested_pole: 'AUDIO_RADIO',
        },
        confidence: 'high',
        notes: null,
      }),
    );
    const { parseInputWithAI } = await import('./parse-with-ai');
    const result = await parseInputWithAI('input');
    expect(result?.company.alternate_domains).toEqual(['francetelevisions.fr', 'france.tv']);
  });

  it('returns empty alternate_domains when AI omits the field', async () => {
    mockAnthropic(
      JSON.stringify({
        person: {
          first_name: null,
          last_name: null,
          email: null,
          phone: null,
          role: null,
          linkedin_url: null,
        },
        company: {
          name: 'X',
          website: null,
          country: null,
          primary_domain: 'x.com',
          description: null,
          suggested_pole: 'INCONNU',
          // alternate_domains absent volontairement
        },
        confidence: 'low',
        notes: null,
      }),
    );
    const { parseInputWithAI } = await import('./parse-with-ai');
    const result = await parseInputWithAI('input');
    expect(result?.company.alternate_domains).toEqual([]);
  });
});
