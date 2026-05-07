import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getListIdsForProspect } from './lifecycle';

const ENV_BACKUP = { ...process.env };

describe('getListIdsForProspect (pure)', () => {
  beforeEach(() => {
    // Reset env vars BREVO_LIST_ID_* en lokal
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('BREVO_LIST_ID_')) delete process.env[k];
    }
    process.env.BREVO_LIST_ID_VERIFIED = '101';
    process.env.BREVO_LIST_ID_POLE_AUDIO_RADIO = '201';
    process.env.BREVO_LIST_ID_POLE_DATA_ADTECH = '202';
    process.env.BREVO_LIST_ID_POLE_VIDEO_CTV = '203';
    process.env.BREVO_LIST_ID_PRS_ELIGIBLE = '301';
    process.env.BREVO_LIST_ID_NON_ELIGIBLE = '302';
    process.env.BREVO_LIST_ID_SIGNED = '401';
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
  });

  it('pole AUDIO_RADIO + prs_exhibitor : verified + pole + prs_eligible', () => {
    const ids = getListIdsForProspect({ pole: 'AUDIO_RADIO', category: 'prs_exhibitor' });
    expect(ids).toEqual([101, 201, 301]);
  });

  it('pole DATA_ADTECH + standard : verified + pole (pas d eligibilite dediee)', () => {
    const ids = getListIdsForProspect({ pole: 'DATA_ADTECH', category: 'standard' });
    expect(ids).toEqual([101, 202]);
  });

  it('pole VIDEO_CTV + non_eligible : verified + pole + non_eligible', () => {
    const ids = getListIdsForProspect({ pole: 'VIDEO_CTV', category: 'non_eligible' });
    expect(ids).toEqual([101, 203, 302]);
  });

  it('pole INCONNU : seulement verified + eligibilite (pas de pole-list)', () => {
    const ids = getListIdsForProspect({ pole: 'INCONNU', category: 'prs_exhibitor' });
    expect(ids).toEqual([101, 301]);
  });

  it('isSigned=true : ajoute la liste SIGNED', () => {
    const ids = getListIdsForProspect({
      pole: 'AUDIO_RADIO',
      category: 'prs_exhibitor',
      isSigned: true,
    });
    expect(ids).toContain(401);
  });

  it('env var manquante : silencieusement omise (pas de crash)', () => {
    delete process.env.BREVO_LIST_ID_VERIFIED;
    delete process.env.BREVO_LIST_ID_POLE_AUDIO_RADIO;
    const ids = getListIdsForProspect({ pole: 'AUDIO_RADIO', category: 'prs_exhibitor' });
    // Seul prs_eligible est dispo.
    expect(ids).toEqual([301]);
  });
});

describe('upsertContactBrevo guards', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skip is_test=true : pas d appel Brevo', async () => {
    process.env.BREVO_API_KEY = 'fake-key';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { upsertContactBrevo } = await import('./lifecycle');
    const result = await upsertContactBrevo({
      is_test: true,
      email: 'test@example.com',
      pole: 'AUDIO_RADIO',
      category: 'prs_exhibitor',
      language: 'FR',
      marketingConsent: true,
    });
    expect(result.skipped).toBe('is_test');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skip no api key : pas d appel Brevo', async () => {
    delete process.env.BREVO_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { upsertContactBrevo } = await import('./lifecycle');
    const result = await upsertContactBrevo({
      email: 'test@example.com',
      pole: 'AUDIO_RADIO',
      category: 'prs_exhibitor',
      language: 'FR',
      marketingConsent: true,
    });
    expect(result.skipped).toBe('no_api_key');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
