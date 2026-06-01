/**
 * @vitest-environment node
 *
 * P8.5 — tests server actions lifecycle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  profile: { id: 'u-1', role: 'admin' as 'admin' | 'sales' | 'super_admin' },
  rules: new Map<
    string,
    {
      id: string;
      rule_key: string;
      is_active: boolean;
      subject_fr: string;
      subject_en: string;
      body_fr_html: string;
      body_en_html: string;
      en_translated_by_ai_at: string | null;
      fr_translated_by_ai_at: string | null;
    }
  >(),
  recipients: [] as Array<{ rule_id: string; contact_id: string }>,
  updates: [] as Array<{ table: string; patch: Record<string, unknown>; id: string }>,
  audits: [] as Record<string, unknown>[],
  anthropicResponse: { subject: 'Hello {prenom}', body_html: '<p>EN body</p>' },
  anthropicShouldFail: false,
};

function mockEnv() {
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => state.profile),
  }));
  vi.doMock('@/lib/auth/role-helpers', () => ({
    hasAdminAccess: (r: string) => r === 'admin' || r === 'super_admin',
  }));
  vi.doMock('@anthropic-ai/sdk', () => ({
    default: class MockAnthropic {
      messages = {
        create: vi.fn(async () => {
          if (state.anthropicShouldFail) throw new Error('Anthropic down');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  subject: state.anthropicResponse.subject,
                  body_html: state.anthropicResponse.body_html,
                }),
              },
            ],
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
  let lastFilter: { col: string; val: unknown } | null = null;
  let pendingDelete = false;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      lastFilter = { col, val };
      return chain;
    },
    maybeSingle: () => {
      if (table === 'lifecycle_rules' && lastFilter) {
        if (lastFilter.col === 'rule_key') {
          const r = state.rules.get(String(lastFilter.val));
          return Promise.resolve({ data: r ?? null, error: null });
        }
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (row: Record<string, unknown>) => {
      pendingInsert = row;
      if (table === 'audit_log') state.audits.push(row);
      return Promise.resolve({ error: null });
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    delete: (opts?: { count?: 'exact' }) => {
      pendingDelete = true;
      void opts;
      return chain;
    },
    then: (cb: (v: { error: null; count?: number }) => unknown) => {
      if (pendingPatch && table === 'lifecycle_rules' && lastFilter?.col === 'id') {
        const id = String(lastFilter.val);
        for (const r of state.rules.values()) {
          if (r.id === id) Object.assign(r, pendingPatch);
        }
        state.updates.push({ table, patch: pendingPatch, id });
      }
      if (pendingDelete && table === 'lifecycle_recipients' && lastFilter?.col === 'rule_id') {
        const ruleId = String(lastFilter.val);
        const before = state.recipients.length;
        state.recipients = state.recipients.filter((r) => r.rule_id !== ruleId);
        const count = before - state.recipients.length;
        void pendingInsert;
        return Promise.resolve({ error: null, count }).then(cb);
      }
      void pendingInsert;
      return Promise.resolve({ error: null }).then(cb);
    },
  };
  return chain;
}

function resetState() {
  state.profile = { id: 'u-1', role: 'admin' };
  state.rules.clear();
  state.recipients = [];
  state.updates = [];
  state.audits = [];
  state.anthropicResponse = { subject: 'Hello {prenom}', body_html: '<p>EN body</p>' };
  state.anthropicShouldFail = false;
}

function seedRule(
  rule_key: string,
  overrides: Partial<typeof state.rules extends Map<string, infer V> ? V : never> = {},
) {
  const base = {
    id: `id-${rule_key}`,
    rule_key,
    is_active: false,
    subject_fr: 'Bonjour {prenom}',
    subject_en: 'Hello {prenom}',
    body_fr_html: '<p>FR body</p>',
    body_en_html: '<p>EN body</p>',
    en_translated_by_ai_at: null,
    fr_translated_by_ai_at: null,
  };
  state.rules.set(rule_key, { ...base, ...overrides });
}

describe('toggleLifecycleRuleAction (P8.5)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('admin rejette (super_admin only)', async () => {
    state.profile.role = 'admin';
    mockEnv();
    seedRule('signup_24h_no_quote');
    const { toggleLifecycleRuleAction } = await import('./actions');
    const r = await toggleLifecycleRuleAction({ rule_key: 'signup_24h_no_quote', is_active: true });
    expect(r.ok).toBe(false);
  });

  it('sales rejette', async () => {
    state.profile.role = 'sales';
    mockEnv();
    seedRule('signup_24h_no_quote');
    const { toggleLifecycleRuleAction } = await import('./actions');
    const r = await toggleLifecycleRuleAction({ rule_key: 'signup_24h_no_quote', is_active: true });
    expect(r.ok).toBe(false);
  });

  it('super_admin OK + audit log cree avec kind=lifecycle_rule_toggled', async () => {
    state.profile.role = 'super_admin';
    mockEnv();
    seedRule('signup_24h_no_quote');
    const { toggleLifecycleRuleAction } = await import('./actions');
    const r = await toggleLifecycleRuleAction({ rule_key: 'signup_24h_no_quote', is_active: true });
    expect(r.ok).toBe(true);
    expect(state.rules.get('signup_24h_no_quote')?.is_active).toBe(true);
    const audit = state.audits.find(
      (a) => (a.after as Record<string, unknown>)?.kind === 'lifecycle_rule_toggled',
    );
    expect(audit).toBeTruthy();
  });
});

describe('editLifecycleTemplateAction (P8.5)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });
  afterEach(() => vi.restoreAllMocks());

  it('sales rejette, admin accepte', async () => {
    state.profile.role = 'sales';
    mockEnv();
    seedRule('signup_24h_no_quote');
    const { editLifecycleTemplateAction } = await import('./actions');
    const r1 = await editLifecycleTemplateAction({
      rule_key: 'signup_24h_no_quote',
      subject_fr: 'X',
      subject_en: 'Y',
      body_fr_html: '<p>X</p>',
      body_en_html: '<p>Y</p>',
    });
    expect(r1.ok).toBe(false);

    state.profile.role = 'admin';
    const { editLifecycleTemplateAction: editAdmin } = await import('./actions');
    const r2 = await editAdmin({
      rule_key: 'signup_24h_no_quote',
      subject_fr: 'X',
      subject_en: 'Y',
      body_fr_html: '<p>X</p>',
      body_en_html: '<p>Y</p>',
    });
    expect(r2.ok).toBe(true);
  });

  it('edit reset le flag IA des langues touchees', async () => {
    state.profile.role = 'admin';
    mockEnv();
    seedRule('signup_24h_no_quote', {
      en_translated_by_ai_at: '2026-05-01T00:00:00Z',
      fr_translated_by_ai_at: '2026-05-01T00:00:00Z',
      subject_fr: 'A',
      subject_en: 'B',
      body_fr_html: '<p>fr</p>',
      body_en_html: '<p>en</p>',
    });
    const { editLifecycleTemplateAction } = await import('./actions');
    await editLifecycleTemplateAction({
      rule_key: 'signup_24h_no_quote',
      subject_fr: 'A modifie', // change
      subject_en: 'B', // identical
      body_fr_html: '<p>fr</p>', // identical
      body_en_html: '<p>en</p>', // identical
    });
    const patch = state.updates[0]?.patch as Record<string, unknown>;
    expect(patch.fr_translated_by_ai_at).toBe(null);
    expect(patch).not.toHaveProperty('en_translated_by_ai_at');
  });
});

describe('translateLifecycleRuleAction (P8.5)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('FR -> EN ok + flag en_translated_by_ai_at + model trace', async () => {
    state.profile.role = 'admin';
    mockEnv();
    seedRule('signup_24h_no_quote');
    const { translateLifecycleRuleAction } = await import('./actions');
    const r = await translateLifecycleRuleAction({
      rule_key: 'signup_24h_no_quote',
      source: 'fr',
      target: 'en',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.model).toBe('claude-haiku-4-5-20251001');
    }
    const patch = state.updates[0]?.patch as Record<string, unknown>;
    expect(patch.subject_en).toBe('Hello {prenom}');
    expect(patch.en_translated_by_ai_at).toBeTruthy();
    expect(patch.translation_model).toBe('claude-haiku-4-5-20251001');
  });

  it('sales rejette', async () => {
    state.profile.role = 'sales';
    mockEnv();
    seedRule('signup_24h_no_quote');
    const { translateLifecycleRuleAction } = await import('./actions');
    const r = await translateLifecycleRuleAction({
      rule_key: 'signup_24h_no_quote',
      source: 'fr',
      target: 'en',
    });
    expect(r.ok).toBe(false);
  });

  it('source===target rejette', async () => {
    state.profile.role = 'admin';
    mockEnv();
    seedRule('signup_24h_no_quote');
    const { translateLifecycleRuleAction } = await import('./actions');
    const r = await translateLifecycleRuleAction({
      rule_key: 'signup_24h_no_quote',
      source: 'fr',
      target: 'fr',
    });
    expect(r.ok).toBe(false);
  });

  it('Anthropic throw -> ok:false', async () => {
    state.profile.role = 'admin';
    state.anthropicShouldFail = true;
    mockEnv();
    seedRule('signup_24h_no_quote');
    const { translateLifecycleRuleAction } = await import('./actions');
    const r = await translateLifecycleRuleAction({
      rule_key: 'signup_24h_no_quote',
      source: 'fr',
      target: 'en',
    });
    expect(r.ok).toBe(false);
  });
});

describe('reTargetLifecycleRuleAction (P8.5)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });
  afterEach(() => vi.restoreAllMocks());

  it('super_admin only', async () => {
    state.profile.role = 'admin';
    mockEnv();
    seedRule('signup_24h_no_quote');
    const { reTargetLifecycleRuleAction } = await import('./actions');
    const r = await reTargetLifecycleRuleAction({ rule_key: 'signup_24h_no_quote' });
    expect(r.ok).toBe(false);
  });

  it('super_admin delete tous les lifecycle_recipients de la regle', async () => {
    state.profile.role = 'super_admin';
    mockEnv();
    seedRule('signup_24h_no_quote');
    state.recipients = [
      { rule_id: 'id-signup_24h_no_quote', contact_id: 'c1' },
      { rule_id: 'id-signup_24h_no_quote', contact_id: 'c2' },
      { rule_id: 'id-other', contact_id: 'c3' },
    ];
    const { reTargetLifecycleRuleAction } = await import('./actions');
    const r = await reTargetLifecycleRuleAction({ rule_key: 'signup_24h_no_quote' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.deleted).toBe(2);
    }
    expect(state.recipients).toHaveLength(1);
    expect(state.recipients[0].contact_id).toBe('c3');
    // Audit log avec kind=lifecycle_rule_retargeted
    const audit = state.audits.find(
      (a) => (a.after as Record<string, unknown>)?.kind === 'lifecycle_rule_retargeted',
    );
    expect(audit).toBeTruthy();
  });
});
