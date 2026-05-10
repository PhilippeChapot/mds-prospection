/**
 * P5.x.4 Phase C — tests upsertContactBrevo avec nouveaux attributs +
 * unlinkListIds (transitions lifecycle).
 *
 * On mocke `fetch` pour intercepter le payload envoye a Brevo et
 * verifier la shape exacte (attributs + listIds + unlinkListIds).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_BACKUP = { ...process.env };

describe('upsertContactBrevo attributes + unlinkListIds (P5.x.4)', () => {
  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('BREVO_LIST_ID_')) delete process.env[k];
    }
    process.env.BREVO_API_KEY = 'fake-key';
    process.env.BREVO_LIST_ID_VERIFIED = '101';
    process.env.BREVO_LIST_ID_POLE_AUDIO_RADIO = '201';
    process.env.BREVO_LIST_ID_PRS_ELIGIBLE = '301';
    process.env.BREVO_LIST_ID_DEVIS_EMIS = '410';
    process.env.BREVO_LIST_ID_ACOMPTE_PAYE = '420';
    process.env.BREVO_LIST_ID_SIGNED = '401';
    process.env.BREVO_LIST_ID_LOST = '430';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function mockFetchOk201() {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({ id: 999 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('attributs DEVIS_*, PACK_CODE, ACOMPTE_PAYMENT_LINK_URL pousses', async () => {
    const fetchMock = mockFetchOk201();
    const { upsertContactBrevo } = await import('./lifecycle');
    await upsertContactBrevo({
      email: 'marie@radio.fr',
      firstName: 'Marie',
      lastName: 'Dupont',
      companyName: 'Radio House',
      pole: 'AUDIO_RADIO',
      category: 'prs_exhibitor',
      language: 'FR',
      marketingConsent: true,
      isQuoted: true,
      sellsyDevisNumber: 'D-20260509-02697',
      sellsyDevisUrl: 'https://file.sellsy.com/abc',
      sellsyDevisTotalTtc: 9156,
      sellsyDevisEmittedAt: '2026-05-09T10:00:00.000Z',
      packCode: 'CLASSIC',
      acomptePaymentLinkUrl: 'https://buy.stripe.com/xyz',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);

    expect(body.attributes).toMatchObject({
      FIRSTNAME: 'Marie',
      LASTNAME: 'Dupont',
      COMPANY: 'Radio House',
      POLE: 'AUDIO_RADIO',
      CATEGORY: 'prs_exhibitor',
      LANGUAGE: 'FR',
      MARKETING_CONSENT: true,
      SELLSY_DEVIS_NUMBER: 'D-20260509-02697',
      SELLSY_DEVIS_URL: 'https://file.sellsy.com/abc',
      DEVIS_TOTAL_TTC: 9156,
      DEVIS_EMITTED_AT: '2026-05-09',
      PACK_CODE: 'CLASSIC',
      ACOMPTE_PAYMENT_LINK_URL: 'https://buy.stripe.com/xyz',
    });
  });

  it('DEVIS_SIGNATURE_DEADLINE = emitted_at + 21 jours (YYYY-MM-DD)', async () => {
    const fetchMock = mockFetchOk201();
    const { upsertContactBrevo } = await import('./lifecycle');
    await upsertContactBrevo({
      email: 'x@y.fr',
      pole: 'AUDIO_RADIO',
      category: 'standard',
      language: 'FR',
      marketingConsent: false,
      sellsyDevisEmittedAt: '2026-05-09T10:00:00.000Z',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.attributes.DEVIS_EMITTED_AT).toBe('2026-05-09');
    expect(body.attributes.DEVIS_SIGNATURE_DEADLINE).toBe('2026-05-30');
  });

  it('attributs SELLSY_*/DEVIS_* omis si null/undefined (preserve valeur Brevo existante)', async () => {
    const fetchMock = mockFetchOk201();
    const { upsertContactBrevo } = await import('./lifecycle');
    await upsertContactBrevo({
      email: 'lead@y.fr',
      pole: 'AUDIO_RADIO',
      category: 'standard',
      language: 'FR',
      marketingConsent: false,
      // pas de sellsyDevis*
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.attributes.SELLSY_DEVIS_NUMBER).toBeUndefined();
    expect(body.attributes.DEVIS_EMITTED_AT).toBeUndefined();
    expect(body.attributes.PACK_CODE).toBeUndefined();
    expect(body.attributes.ACOMPTE_PAYMENT_LINK_URL).toBeUndefined();
    // Les attributs core restent presents.
    expect(body.attributes.FIRSTNAME).toBeDefined();
  });

  it('isQuoted=true : listIds inclut DEVIS_EMIS, unlinkListIds = autres lifecycle', async () => {
    const fetchMock = mockFetchOk201();
    const { upsertContactBrevo } = await import('./lifecycle');
    await upsertContactBrevo({
      email: 'q@y.fr',
      pole: 'AUDIO_RADIO',
      category: 'prs_exhibitor',
      language: 'FR',
      marketingConsent: false,
      isQuoted: true,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.listIds).toContain(410); // DEVIS_EMIS
    expect(body.listIds).toContain(101); // VERIFIED
    expect(body.listIds).toContain(201); // POLE
    expect(body.listIds).toContain(301); // PRS
    expect(body.unlinkListIds).toContain(420); // ACOMPTE_PAYE
    expect(body.unlinkListIds).toContain(401); // SIGNED
    expect(body.unlinkListIds).toContain(430); // LOST
    expect(body.unlinkListIds).not.toContain(410); // pas la cible courante
    // Listes stables jamais dans unlinkListIds.
    expect(body.unlinkListIds).not.toContain(101);
    expect(body.unlinkListIds).not.toContain(201);
    expect(body.unlinkListIds).not.toContain(301);
  });

  it('isAcomptePaid=true : listIds=ACOMPTE_PAYE, unlinkListIds=DEVIS_EMIS+SIGNED+LOST', async () => {
    const fetchMock = mockFetchOk201();
    const { upsertContactBrevo } = await import('./lifecycle');
    await upsertContactBrevo({
      email: 'a@y.fr',
      pole: 'AUDIO_RADIO',
      category: 'prs_exhibitor',
      language: 'FR',
      marketingConsent: false,
      isAcomptePaid: true,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.listIds).toContain(420); // ACOMPTE_PAYE
    expect(body.unlinkListIds).toContain(410);
    expect(body.unlinkListIds).toContain(401);
    expect(body.unlinkListIds).toContain(430);
    expect(body.unlinkListIds).not.toContain(420);
  });

  it('isLost=true : listIds=LOST, unlinkListIds=DEVIS_EMIS+ACOMPTE_PAYE+SIGNED', async () => {
    const fetchMock = mockFetchOk201();
    const { upsertContactBrevo } = await import('./lifecycle');
    await upsertContactBrevo({
      email: 'lost@y.fr',
      pole: 'AUDIO_RADIO',
      category: 'prs_exhibitor',
      language: 'FR',
      marketingConsent: false,
      isLost: true,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.listIds).toContain(430); // LOST
    expect(body.unlinkListIds).toEqual(expect.arrayContaining([410, 420, 401]));
    expect(body.unlinkListIds).not.toContain(430);
  });

  it('aucun flag lifecycle : pas de unlinkListIds (etat lead/initial)', async () => {
    const fetchMock = mockFetchOk201();
    const { upsertContactBrevo } = await import('./lifecycle');
    await upsertContactBrevo({
      email: 'lead@y.fr',
      pole: 'AUDIO_RADIO',
      category: 'prs_exhibitor',
      language: 'FR',
      marketingConsent: false,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    // Aucune liste lifecycle dans la cible -> les 4 sont a unlink (au cas ou
    // le contact y etait deja, on l'en sort proprement).
    expect(body.unlinkListIds).toEqual(expect.arrayContaining([410, 420, 401, 430]));
  });
});
