/**
 * P5.x.23 — tests INSEE Sirene helper.
 *
 * Validation :
 *   - sanitizeForLucene : remplace caractères réservés par espace
 *   - searchSireneByName : 404 → [], 200 → résultats
 *   - autoMatchSiren : null (0 résultat), auto (1), auto (1 siège), ambiguous (multi)
 *   - throw si INSEE_API_KEY manquant
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeForLucene, searchSireneByName, autoMatchSiren } from './sirene';

const ENV_BACKUP = { ...process.env };

function etab(opts: { siret: string; siege?: boolean; denom?: string }) {
  return {
    siren: opts.siret.slice(0, 9),
    siret: opts.siret,
    etablissementSiege: opts.siege ?? false,
    etatAdministratifEtablissement: 'A' as const,
    uniteLegale: {
      denominationUniteLegale: opts.denom ?? 'TEST CO',
      activitePrincipaleUniteLegale: null,
      categorieJuridiqueUniteLegale: null,
    },
    adresseEtablissement: {
      numeroVoieEtablissement: null,
      typeVoieEtablissement: null,
      libelleVoieEtablissement: null,
      codePostalEtablissement: '75001',
      libelleCommuneEtablissement: 'PARIS',
    },
  };
}

describe('sanitizeForLucene', () => {
  it('replaces Lucene reserved chars with spaces', () => {
    expect(sanitizeForLucene('Foo (Bar) / Baz')).toBe('Foo Bar Baz');
    expect(sanitizeForLucene('A&B || C')).toBe('A B C');
    expect(sanitizeForLucene('"quoted" [bracket]')).toBe('quoted bracket');
  });
  it('collapses whitespace', () => {
    expect(sanitizeForLucene('  multiple   spaces  ')).toBe('multiple spaces');
  });
});

describe('searchSireneByName', () => {
  beforeEach(() => {
    process.env.INSEE_API_KEY = 'test-key';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    if (!ENV_BACKUP.INSEE_API_KEY) delete process.env.INSEE_API_KEY;
    vi.restoreAllMocks();
  });

  it('returns [] on 404 (no match)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('') } as Response);
    const result = await searchSireneByName('inexistant');
    expect(result).toEqual([]);
  });

  it('returns etablissements on 200', async () => {
    const fake = [etab({ siret: '12345678900012', siege: true })];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ etablissements: fake }),
    } as Response);
    const result = await searchSireneByName('TEST CO');
    expect(result).toHaveLength(1);
    expect(result[0]?.siren).toBe('123456789');
  });

  it('throws on 500', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('server error'),
    } as Response);
    await expect(searchSireneByName('foo')).rejects.toThrow(/500/);
  });

  it('throws when INSEE_API_KEY missing', async () => {
    delete process.env.INSEE_API_KEY;
    await expect(searchSireneByName('foo')).rejects.toThrow(/INSEE_API_KEY/);
  });
});

describe('autoMatchSiren', () => {
  beforeEach(() => {
    process.env.INSEE_API_KEY = 'test-key';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    if (!ENV_BACKUP.INSEE_API_KEY) delete process.env.INSEE_API_KEY;
    vi.restoreAllMocks();
  });

  it('returns null when 0 results', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ etablissements: [] }),
    } as Response);
    const result = await autoMatchSiren('inexistant');
    expect(result).toBeNull();
  });

  it('returns auto when exactly 1 result', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          etablissements: [etab({ siret: '12345678900012', siege: true, denom: 'UNIQUE' })],
        }),
    } as Response);
    const result = await autoMatchSiren('UNIQUE');
    expect(result?.auto).toBe(true);
    if (result?.auto) {
      expect(result.siren).toBe('123456789');
      expect(result.siret).toBe('12345678900012');
    }
  });

  it('returns auto siege when multiple results with single siege', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          etablissements: [
            etab({ siret: '11111111100001', siege: true, denom: 'MAIN' }),
            etab({ siret: '11111111100002', siege: false, denom: 'BRANCH' }),
          ],
        }),
    } as Response);
    const result = await autoMatchSiren('MAIN');
    expect(result?.auto).toBe(true);
    if (result?.auto) {
      expect(result.siret).toBe('11111111100001');
    }
  });

  it('returns ambiguous when multiple results with no clear siege', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          etablissements: [
            etab({ siret: '22222222200001', siege: false, denom: 'A' }),
            etab({ siret: '33333333300001', siege: false, denom: 'B' }),
          ],
        }),
    } as Response);
    const result = await autoMatchSiren('AMBIGU');
    expect(result?.ambiguous).toBe(true);
    if (result?.ambiguous) {
      expect(result.candidates).toHaveLength(2);
    }
  });
});
