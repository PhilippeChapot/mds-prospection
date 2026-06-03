/**
 * @vitest-environment node
 *
 * P8.3 — tests Brevo batch sender.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { personalize, buildUnsubscribeFooter, sendCampaignBatch } from './send-campaign';

describe('personalize (P8.3)', () => {
  it('substitue {prenom} / {societe} / {etape}', () => {
    const r = personalize(
      'Bonjour {prenom} de {societe} ({etape})!',
      {
        contact_id: 'c1',
        email: 'a@x.fr',
        first_name: 'Alice',
        last_name: 'Martin',
        company_name: 'Acme',
        language: 'FR',
      },
      { etape: 'Paris' },
    );
    expect(r).toBe('Bonjour Alice de Acme (Paris)!');
  });

  it('echappe HTML dans les valeurs (anti-XSS)', () => {
    const r = personalize('Hello {prenom}', {
      contact_id: 'c1',
      email: 'a@x.fr',
      first_name: '<script>alert(1)</script>',
      last_name: null,
      company_name: null,
      language: 'FR',
    });
    expect(r).toContain('&lt;script&gt;');
    expect(r).not.toContain('<script>');
  });

  it('case-insensitive sur le nom du placeholder', () => {
    const r = personalize('{PRENOM} {Societe}', {
      contact_id: 'c1',
      email: 'a@x.fr',
      first_name: 'Bob',
      last_name: null,
      company_name: 'X',
      language: 'FR',
    });
    expect(r).toBe('Bob X');
  });

  // P8.3-bis Fix #3 : la meme fonction est utilisee sur le SUBJECT
  // (avant : "[TEST] Bonjour {prenom}" arrivait brut a Phil).
  it('Fix #3 : substitue {prenom} dans un subject', () => {
    const r = personalize('Bonjour {prenom}, votre devis est prêt', {
      contact_id: 'c1',
      email: 'a@x.fr',
      first_name: 'Alice',
      last_name: null,
      company_name: null,
      language: 'FR',
    });
    expect(r).toBe('Bonjour Alice, votre devis est prêt');
    expect(r).not.toContain('{prenom}');
  });
});

describe('buildUnsubscribeFooter (P8.3)', () => {
  it('contient le lien preferences en FR', () => {
    const f = buildUnsubscribeFooter({ locale: 'fr', appUrl: 'https://mediadays.solutions' });
    expect(f).toContain('Gérer mes préférences');
    expect(f).toContain('https://mediadays.solutions/fr/espace-partenaire');
  });

  it('EN variant', () => {
    const f = buildUnsubscribeFooter({ locale: 'en', appUrl: 'https://mediadays.solutions' });
    expect(f).toContain('Manage my preferences');
    expect(f).toContain('/en/espace-partenaire');
  });
});

describe('sendCampaignBatch (P8.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('envoi inline : batch + perso + footer', async () => {
    const fetchCalls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : null;
        fetchCalls.push({ url, body });
        return new Response(JSON.stringify({ messageId: 'msg-1' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const r = await sendCampaignBatch({
      apiKey: 'k',
      senderEmail: 's@s.fr',
      senderName: 'MDS',
      recipients: [
        {
          contact_id: 'c1',
          email: 'a@x.fr',
          first_name: 'A',
          last_name: null,
          company_name: 'Acme',
          language: 'FR',
        },
        {
          contact_id: 'c2',
          email: 'b@x.fr',
          first_name: 'B',
          last_name: null,
          company_name: 'Other',
          language: 'EN',
        },
      ],
      subject: 'Bonjour {prenom}',
      htmlContent: '<p>Hello {prenom} de {societe}</p>',
      appUrl: 'https://mediadays.solutions',
      batchSize: 2,
      delayMs: 0,
    });
    expect(r.sent).toBe(2);
    expect(r.errors).toHaveLength(0);
    expect(fetchCalls).toHaveLength(2);
    // Verifie personnalisation differente par recipient.
    const body0 = fetchCalls[0].body as { subject: string; htmlContent: string };
    expect(body0.subject).toBe('Bonjour A');
    expect(body0.htmlContent).toContain('Hello A de Acme');
    expect(body0.htmlContent).toContain('Gérer mes préférences'); // footer FR
    // P8.3-bis Fix #2 : wrapper MDS applique (header brande).
    expect(body0.htmlContent).toContain('MediaDays Solutions 2026');
    expect(body0.htmlContent).toContain('Éditions HF');
    const body1 = fetchCalls[1].body as { subject: string; htmlContent: string };
    expect(body1.htmlContent).toContain('Hello B de Other');
    expect(body1.htmlContent).toContain('Manage my preferences'); // footer EN
  });

  it('mode template : envoie templateId + params (firstName/company/preferencesUrl)', async () => {
    const calls: Array<{ body: { templateId?: number; params?: Record<string, unknown> } }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = init?.body
          ? (JSON.parse(init.body as string) as {
              templateId?: number;
              params?: Record<string, unknown>;
            })
          : ({} as never);
        calls.push({ body });
        return new Response(JSON.stringify({ messageId: 'm' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const r = await sendCampaignBatch({
      apiKey: 'k',
      senderEmail: 's@s.fr',
      senderName: 'MDS',
      recipients: [
        {
          contact_id: 'c1',
          email: 'a@x.fr',
          first_name: 'Alice',
          last_name: 'M',
          company_name: 'Acme',
          language: 'FR',
        },
      ],
      subject: 'Hi',
      templateId: 42,
      appUrl: 'https://mediadays.solutions',
      delayMs: 0,
    });
    expect(r.sent).toBe(1);
    expect(calls[0].body.templateId).toBe(42);
    expect(calls[0].body.params).toMatchObject({
      firstName: 'Alice',
      company: 'Acme',
      preferencesUrl: expect.stringContaining('/fr/espace-partenaire'),
    });
  });

  it('erreur Brevo (500) -> logged dans errors[]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );
    const r = await sendCampaignBatch({
      apiKey: 'k',
      senderEmail: 's@s.fr',
      senderName: 'MDS',
      recipients: [
        {
          contact_id: 'c1',
          email: 'a@x.fr',
          first_name: null,
          last_name: null,
          company_name: null,
          language: 'FR',
        },
      ],
      subject: 'X',
      htmlContent: '<p>X</p>',
      appUrl: 'https://mediadays.solutions',
      delayMs: 0,
    });
    expect(r.sent).toBe(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].error_message).toContain('500');
  });
});
