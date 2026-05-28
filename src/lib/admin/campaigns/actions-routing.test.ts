/**
 * @vitest-environment node
 *
 * P8.3-quater — tests routing FR/EN dans sendCampaignAction.
 *
 * Strategie : on observe les appels a sendCampaignBatch et on verifie
 * que le bon subject/body est passe selon la langue des recipients
 * (split FR vs EN cote sendCampaignAction).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  campaign: {
    id: 'aaaa1111-1111-4111-8111-111111111111',
    name: 'Test',
    status: 'draft',
    audience_key: 'newsletter_subscribers',
    category: 'general',
    audience_filters: {},
    content_mode: 'inline',
    subject_fr: 'Bonjour',
    body_fr: '<p>Bonjour</p>',
    subject_en: 'Hello',
    body_en: '<p>Hello</p>',
    test_email_sent_at: '2026-05-28T10:00:00Z',
    brevo_template_id: null as number | null,
  } as Record<string, unknown>,
  // Recipients : mix FR + EN.
  recipients: [] as Array<{
    contact_id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    language: 'FR' | 'EN';
  }>,
  batchCalls: [] as Array<{
    recipients: unknown[];
    subject: string;
    htmlContent: string | undefined;
  }>,
};

function mockEnv() {
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => ({
      id: 'u1',
      email: 'a@m.fr',
      full_name: 'A',
      role: 'admin' as const,
    })),
  }));
  vi.doMock('./audiences', () => ({
    resolveAudience: vi.fn(async () => ({
      eligible: state.recipients,
      skipped: [],
    })),
    AUDIENCES: [],
  }));
  vi.doMock('@/lib/brevo/send-campaign', () => ({
    sendCampaignBatch: vi.fn(
      async (opts: { recipients: unknown[]; subject: string; htmlContent: string | undefined }) => {
        state.batchCalls.push({
          recipients: opts.recipients,
          subject: opts.subject,
          htmlContent: opts.htmlContent,
        });
        return {
          sent: opts.recipients.length,
          errors: [],
          brevo_ids: (opts.recipients as Array<{ contact_id: string; email: string }>).map((r) => ({
            contact_id: r.contact_id,
            email: r.email,
            message_id: 'm',
          })),
        };
      },
    ),
    personalize: (s: string) => s,
    buildUnsubscribeFooter: () => '',
  }));
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(async () => ({ id: 'r' })),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return { from: () => makeChain() };
}

function makeChain() {
  let pendingInsert: Record<string, unknown> | Record<string, unknown>[] | null = null;
  let pendingPatch: Record<string, unknown> | null = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: state.campaign, error: null }),
    single: () => Promise.resolve({ data: { id: state.campaign.id }, error: null }),
    insert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
      pendingInsert = row;
      return Promise.resolve({ error: null });
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    then: (onfulfilled: (v: { error: null }) => unknown) => {
      void pendingInsert;
      if (pendingPatch && state.campaign) {
        Object.assign(state.campaign, pendingPatch);
      }
      return Promise.resolve({ error: null }).then(onfulfilled);
    },
  };
  return chain;
}

describe('sendCampaignAction routing FR/EN (P8.3-quater)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.batchCalls = [];
    state.campaign.status = 'draft';
    state.campaign.subject_fr = 'Bonjour';
    state.campaign.body_fr = '<p>Bonjour</p>';
    state.campaign.subject_en = 'Hello';
    state.campaign.body_en = '<p>Hello</p>';
    process.env.BREVO_API_KEY = 'k';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('FR + EN recipients : 2 batchs avec subjects/bodies langues respectives', async () => {
    state.recipients = [
      {
        contact_id: 'c1',
        email: 'fr1@x.fr',
        first_name: 'A',
        last_name: null,
        company_name: null,
        language: 'FR',
      },
      {
        contact_id: 'c2',
        email: 'en1@x.fr',
        first_name: 'B',
        last_name: null,
        company_name: null,
        language: 'EN',
      },
      {
        contact_id: 'c3',
        email: 'fr2@x.fr',
        first_name: 'C',
        last_name: null,
        company_name: null,
        language: 'FR',
      },
    ];
    mockEnv();
    const { sendCampaignAction } = await import('./actions');
    const r = await sendCampaignAction({
      campaign_id: 'aaaa1111-1111-4111-8111-111111111111',
      confirmation_count: 3,
    });
    expect(r.ok).toBe(true);
    expect(state.batchCalls).toHaveLength(2);
    const frBatch = state.batchCalls.find((b) => b.subject === 'Bonjour');
    const enBatch = state.batchCalls.find((b) => b.subject === 'Hello');
    expect(frBatch?.recipients).toHaveLength(2);
    expect(enBatch?.recipients).toHaveLength(1);
    expect(frBatch?.htmlContent).toBe('<p>Bonjour</p>');
    expect(enBatch?.htmlContent).toBe('<p>Hello</p>');
  });

  it('Contact EN + body_en vide -> fallback subject_fr/body_fr', async () => {
    state.campaign.subject_en = null;
    state.campaign.body_en = null;
    state.recipients = [
      {
        contact_id: 'c1',
        email: 'en1@x.fr',
        first_name: null,
        last_name: null,
        company_name: null,
        language: 'EN',
      },
    ];
    mockEnv();
    const { sendCampaignAction } = await import('./actions');
    const r = await sendCampaignAction({
      campaign_id: 'aaaa1111-1111-4111-8111-111111111111',
      confirmation_count: 1,
    });
    expect(r.ok).toBe(true);
    // Le contact EN recoit la version FR (fallback).
    expect(state.batchCalls).toHaveLength(1);
    expect(state.batchCalls[0].subject).toBe('Bonjour');
    expect(state.batchCalls[0].htmlContent).toBe('<p>Bonjour</p>');
  });

  it('Contact sans language (default FR) -> subject_fr', async () => {
    state.recipients = [
      // language='FR' force ici (notre type ne permet pas undefined, le default applicatif est FR).
      {
        contact_id: 'c1',
        email: 'x@x.fr',
        first_name: null,
        last_name: null,
        company_name: null,
        language: 'FR',
      },
    ];
    mockEnv();
    const { sendCampaignAction } = await import('./actions');
    await sendCampaignAction({
      campaign_id: 'aaaa1111-1111-4111-8111-111111111111',
      confirmation_count: 1,
    });
    expect(state.batchCalls[0].subject).toBe('Bonjour');
  });

  it('Tous EN, body_en present : 1 batch EN', async () => {
    state.recipients = [
      {
        contact_id: 'c1',
        email: 'en1@x.fr',
        first_name: null,
        last_name: null,
        company_name: null,
        language: 'EN',
      },
      {
        contact_id: 'c2',
        email: 'en2@x.fr',
        first_name: null,
        last_name: null,
        company_name: null,
        language: 'EN',
      },
    ];
    mockEnv();
    const { sendCampaignAction } = await import('./actions');
    await sendCampaignAction({
      campaign_id: 'aaaa1111-1111-4111-8111-111111111111',
      confirmation_count: 2,
    });
    expect(state.batchCalls).toHaveLength(1);
    expect(state.batchCalls[0].subject).toBe('Hello');
    expect((state.batchCalls[0].recipients as unknown[]).length).toBe(2);
  });
});
