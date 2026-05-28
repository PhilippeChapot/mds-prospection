/**
 * @vitest-environment node
 *
 * P8.3-quater — tests server actions traduction IA.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  profile: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@mds.fr',
    full_name: 'Admin',
    role: 'admin' as 'admin' | 'sales' | 'super_admin',
  },
  campaign: null as Record<string, unknown> | null,
  updates: [] as Array<{ patch: Record<string, unknown> }>,
  audits: [] as Record<string, unknown>[],
  anthropicResponse: { subject: 'Hello {prenom}', body_html: '<p>Hello {prenom}</p>' },
  anthropicShouldFail: false,
  anthropicRawText: '',
};

function mockEnv() {
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => state.profile),
  }));
  vi.doMock('@anthropic-ai/sdk', () => ({
    default: class MockAnthropic {
      messages = {
        create: vi.fn(async () => {
          if (state.anthropicShouldFail) throw new Error('Anthropic down');
          const text =
            state.anthropicRawText ||
            JSON.stringify({
              subject: state.anthropicResponse.subject,
              body_html: state.anthropicResponse.body_html,
            });
          return {
            content: [{ type: 'text', text }],
          };
        }),
      };
    },
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  let pendingPatch: Record<string, unknown> | null = null;
  let pendingInsert: Record<string, unknown> | null = null;
  const filters: Array<{ col: string; val: unknown }> = [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push({ col, val });
      return chain;
    },
    maybeSingle: () =>
      Promise.resolve({
        data: table === 'email_campaigns' ? state.campaign : null,
        error: null,
      }),
    insert: (row: Record<string, unknown>) => {
      pendingInsert = row;
      if (table === 'audit_log') {
        state.audits.push(row);
        return Promise.resolve({ error: null });
      }
      return Promise.resolve({ error: null });
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    then: (onfulfilled: (v: { error: null }) => unknown) => {
      if (pendingPatch && table === 'email_campaigns') {
        state.updates.push({ patch: pendingPatch });
      }
      void pendingInsert;
      return Promise.resolve({ error: null }).then(onfulfilled);
    },
  };
  return chain;
}

function resetState() {
  state.profile = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@mds.fr',
    full_name: 'Admin',
    role: 'admin',
  };
  state.campaign = {
    id: '11111111-1111-4111-8111-111111111111',
    subject_fr: 'Bonjour {prenom}',
    body_fr: '<p>Bonjour {prenom}</p>',
    subject_en: null,
    body_en: null,
  };
  state.updates = [];
  state.audits = [];
  state.anthropicResponse = { subject: 'Hello {prenom}', body_html: '<p>Hello {prenom}</p>' };
  state.anthropicShouldFail = false;
  state.anthropicRawText = '';
}

describe('translateCampaignAction (P8.3-quater)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('FR -> EN : update patch contient subject_en, body_en + en_translated_by_ai_at + translation_model', async () => {
    mockEnv();
    const { translateCampaignAction } = await import('./translate-action');
    const r = await translateCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      source: 'fr',
      target: 'en',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subject).toBe('Hello {prenom}');
      expect(r.model).toBe('claude-haiku-4-5-20251001');
    }
    const patch = state.updates[0].patch as Record<string, unknown>;
    expect(patch.subject_en).toBe('Hello {prenom}');
    expect(patch.body_en).toBe('<p>Hello {prenom}</p>');
    expect(patch.en_translated_by_ai_at).toBeTruthy();
    expect(patch.translation_model).toBe('claude-haiku-4-5-20251001');
  });

  it('sales -> ok:false (RBAC strict)', async () => {
    state.profile.role = 'sales';
    mockEnv();
    const { translateCampaignAction } = await import('./translate-action');
    const r = await translateCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      source: 'fr',
      target: 'en',
    });
    expect(r.ok).toBe(false);
  });

  it('source vide -> ok:false', async () => {
    state.campaign!.subject_fr = null;
    state.campaign!.body_fr = null;
    mockEnv();
    const { translateCampaignAction } = await import('./translate-action');
    const r = await translateCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      source: 'fr',
      target: 'en',
    });
    expect(r.ok).toBe(false);
  });

  it('source === target -> ok:false', async () => {
    mockEnv();
    const { translateCampaignAction } = await import('./translate-action');
    const r = await translateCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      source: 'fr',
      target: 'fr',
    });
    expect(r.ok).toBe(false);
  });

  it('reponse IA sans JSON parsable -> ok:false', async () => {
    state.anthropicRawText = 'Bonjour, voici la traduction sans JSON.';
    mockEnv();
    const { translateCampaignAction } = await import('./translate-action');
    const r = await translateCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      source: 'fr',
      target: 'en',
    });
    expect(r.ok).toBe(false);
  });

  it('reponse JSON sans subject/body_html -> ok:false', async () => {
    state.anthropicRawText = JSON.stringify({ subject: 'X' }); // body manquant
    mockEnv();
    const { translateCampaignAction } = await import('./translate-action');
    const r = await translateCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      source: 'fr',
      target: 'en',
    });
    expect(r.ok).toBe(false);
  });

  it('Anthropic throw -> ok:false', async () => {
    state.anthropicShouldFail = true;
    mockEnv();
    const { translateCampaignAction } = await import('./translate-action');
    const r = await translateCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      source: 'fr',
      target: 'en',
    });
    expect(r.ok).toBe(false);
  });

  it('EN -> FR : update patch contient subject_fr + fr_translated_by_ai_at', async () => {
    state.campaign!.subject_en = 'Hello';
    state.campaign!.body_en = '<p>Hello</p>';
    state.anthropicResponse = { subject: 'Bonjour', body_html: '<p>Bonjour</p>' };
    mockEnv();
    const { translateCampaignAction } = await import('./translate-action');
    const r = await translateCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      source: 'en',
      target: 'fr',
    });
    expect(r.ok).toBe(true);
    const patch = state.updates[0].patch as Record<string, unknown>;
    expect(patch.subject_fr).toBe('Bonjour');
    expect(patch.fr_translated_by_ai_at).toBeTruthy();
  });

  it('audit log kind=campaign_translated_by_ai cree', async () => {
    mockEnv();
    const { translateCampaignAction } = await import('./translate-action');
    await translateCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      source: 'fr',
      target: 'en',
    });
    expect(state.audits).toHaveLength(1);
    const after = state.audits[0].after as Record<string, unknown>;
    expect(after.kind).toBe('campaign_translated_by_ai');
    expect(after.source).toBe('fr');
    expect(after.target).toBe('en');
    expect(after.model).toBe('claude-haiku-4-5-20251001');
  });
});

describe('markCampaignBodyManuallyEditedAction (P8.3-quater)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('lang=en -> patch en_translated_by_ai_at=null', async () => {
    mockEnv();
    const { markCampaignBodyManuallyEditedAction } = await import('./translate-action');
    const r = await markCampaignBodyManuallyEditedAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      lang: 'en',
    });
    expect(r.ok).toBe(true);
    const patch = state.updates[0].patch as Record<string, unknown>;
    expect(patch.en_translated_by_ai_at).toBeNull();
  });

  it('lang=fr -> patch fr_translated_by_ai_at=null', async () => {
    mockEnv();
    const { markCampaignBodyManuallyEditedAction } = await import('./translate-action');
    await markCampaignBodyManuallyEditedAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      lang: 'fr',
    });
    const patch = state.updates[0].patch as Record<string, unknown>;
    expect(patch.fr_translated_by_ai_at).toBeNull();
  });
});
