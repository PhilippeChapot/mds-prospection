/**
 * @vitest-environment node
 *
 * P8.3 — tests server actions campagnes.
 *
 * Focus : RBAC + garde-fous (test obligatoire + confirmation chiffree).
 * Le flow complet (resolveAudience + Brevo) est teste separement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  isSales: false,
  profile: {
    id: 'aaaa1111-1111-4111-8111-111111111111',
    email: 'alice@mds.fr',
    full_name: 'Alice',
    role: 'admin' as 'admin' | 'sales' | 'super_admin',
  },
  campaigns: [] as Record<string, unknown>[],
  audienceEligible: 3,
  brevoEnvSet: true,
};

function mockEnv() {
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => state.profile),
  }));
  vi.doMock('./audiences', () => ({
    resolveAudience: vi.fn(async () => ({
      eligible: Array.from({ length: state.audienceEligible }, (_, i) => ({
        contact_id: `c${i}`,
        email: `c${i}@x.fr`,
        first_name: `F${i}`,
        last_name: 'L',
        company_name: 'Co',
        language: 'FR' as const,
      })),
      skipped: [],
    })),
    AUDIENCES: [],
  }));
  vi.doMock('@/lib/brevo/send-campaign', () => ({
    sendCampaignBatch: vi.fn(async () => ({
      sent: state.audienceEligible,
      errors: [],
      brevo_ids: Array.from({ length: state.audienceEligible }, (_, i) => ({
        contact_id: `c${i}`,
        email: `c${i}@x.fr`,
        message_id: `m${i}`,
      })),
    })),
    personalize: (s: string) => s,
    buildUnsubscribeFooter: () => '',
  }));
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(async () => ({ id: 'r1' })),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  let pendingInsert: Record<string, unknown> | Record<string, unknown>[] | null = null;
  let pendingPatch: Record<string, unknown> | null = null;
  const filters: Array<{ col: string; val: unknown }> = [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push({ col, val });
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => {
      if (table === 'email_campaigns') {
        const id = filters.find((f) => f.col === 'id')?.val as string | undefined;
        const row = state.campaigns.find((c) => c.id === id) ?? null;
        return Promise.resolve({ data: row, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    single: () => {
      if (pendingInsert && !Array.isArray(pendingInsert) && table === 'email_campaigns') {
        const id = `cmp-${state.campaigns.length}`;
        const row = { id, ...pendingInsert };
        state.campaigns.push(row);
        return Promise.resolve({ data: { id }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (rowOrRows: Record<string, unknown> | Record<string, unknown>[]) => {
      pendingInsert = rowOrRows;
      if (Array.isArray(rowOrRows) || table === 'audit_log' || table === 'campaign_recipients') {
        return Promise.resolve({ error: null });
      }
      return chain;
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    then: (onfulfilled: (v: { error: null }) => unknown) => {
      if (pendingPatch && filters.length > 0 && table === 'email_campaigns') {
        const id = filters.find((f) => f.col === 'id')?.val as string | undefined;
        const row = state.campaigns.find((c) => c.id === id);
        if (row) Object.assign(row, pendingPatch);
      }
      return Promise.resolve({ error: null }).then(onfulfilled);
    },
  };
  return chain;
}

function resetState() {
  state.isSales = false;
  state.profile = {
    id: 'aaaa1111-1111-4111-8111-111111111111',
    email: 'alice@mds.fr',
    full_name: 'Alice',
    role: 'admin',
  };
  state.campaigns = [];
  state.audienceEligible = 3;
  state.brevoEnvSet = true;
}

describe('createCampaignAction (P8.3)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('cree un draft (sales OK)', async () => {
    state.profile.role = 'sales';
    mockEnv();
    const { createCampaignAction } = await import('./actions');
    const r = await createCampaignAction({
      name: 'Test',
      category: 'general',
      audience_key: 'newsletter_subscribers',
      content_mode: 'inline',
      subject: 'Hello',
      body_html: '<p>Bonjour</p>',
    });
    expect(r.ok).toBe(true);
    expect(state.campaigns).toHaveLength(1);
    expect(state.campaigns[0].status).toBe('draft');
  });

  it('inline sans body_html -> ok:false', async () => {
    mockEnv();
    const { createCampaignAction } = await import('./actions');
    const r = await createCampaignAction({
      name: 'Test',
      category: 'general',
      audience_key: 'newsletter_subscribers',
      content_mode: 'inline',
      subject: 'Hello',
    });
    expect(r.ok).toBe(false);
  });

  it('template sans brevo_template_id -> ok:false', async () => {
    mockEnv();
    const { createCampaignAction } = await import('./actions');
    const r = await createCampaignAction({
      name: 'Test',
      category: 'general',
      audience_key: 'newsletter_subscribers',
      content_mode: 'template',
      subject: 'Hello',
    });
    expect(r.ok).toBe(false);
  });
});

describe('sendCampaignAction (P8.3 RBAC + garde-fous)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    state.campaigns = [
      {
        id: 'cmp-1',
        name: 'Test',
        status: 'draft',
        audience_key: 'newsletter_subscribers',
        category: 'general',
        audience_filters: {},
        content_mode: 'inline',
        subject_fr: 'Hello',
        body_fr: '<p>Bonjour {prenom}</p>',
        test_email_sent_at: '2026-05-27T10:00:00Z',
      },
    ];
    process.env.BREVO_API_KEY = 'test-key';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('sales -> ok:false (pas le droit d envoyer)', async () => {
    state.profile.role = 'sales';
    mockEnv();
    const { sendCampaignAction } = await import('./actions');
    const r = await sendCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      confirmation_count: 3,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('admin');
  });

  it("confirmation_count incorrect -> ok:false 'Confirmation...'", async () => {
    state.campaigns[0].id = '11111111-1111-4111-8111-111111111111';
    mockEnv();
    const { sendCampaignAction } = await import('./actions');
    const r = await sendCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      confirmation_count: 999, // bad
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain('confirmation');
  });

  it('pas de test envoye -> ok:false', async () => {
    state.campaigns[0].id = '11111111-1111-4111-8111-111111111111';
    state.campaigns[0].test_email_sent_at = null;
    mockEnv();
    const { sendCampaignAction } = await import('./actions');
    const r = await sendCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      confirmation_count: 3,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain('test');
  });

  it('admin + test OK + confirmation OK + audience 3 -> sent=3', async () => {
    state.campaigns[0].id = '11111111-1111-4111-8111-111111111111';
    mockEnv();
    const { sendCampaignAction } = await import('./actions');
    const r = await sendCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      confirmation_count: 3,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sent).toBe(3);
      expect(r.errors).toBe(0);
    }
    // Status update -> sent.
    const cmp = state.campaigns.find((c) => c.id === '11111111-1111-4111-8111-111111111111');
    expect(cmp?.status).toBe('sent');
    expect(cmp?.sent_by_user_id).toBe(state.profile.id);
  });

  it('campagne deja envoyee -> ok:false', async () => {
    state.campaigns[0].id = '11111111-1111-4111-8111-111111111111';
    state.campaigns[0].status = 'sent';
    mockEnv();
    const { sendCampaignAction } = await import('./actions');
    const r = await sendCampaignAction({
      campaign_id: '11111111-1111-4111-8111-111111111111',
      confirmation_count: 3,
    });
    expect(r.ok).toBe(false);
  });
});

// P8.3-bis Fix #1 : tests editCampaignAction.
describe('editCampaignAction (P8.3-bis Fix #1)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    state.campaigns = [
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Old',
        status: 'draft',
        content_mode: 'inline',
        subject_fr: 'Old',
        body_fr: '<p>old</p>',
        test_email_sent_at: '2026-05-27T10:00:00Z',
      },
    ];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('draft : modifie name/subject/body + RESET test_email_sent_at', async () => {
    mockEnv();
    const { editCampaignAction } = await import('./actions');
    const r = await editCampaignAction({
      campaign_id: '22222222-2222-4222-8222-222222222222',
      name: 'New',
      subject: 'Hello {prenom}',
      body_html: '<p>new body</p>',
    });
    expect(r.ok).toBe(true);
    const cmp = state.campaigns.find((c) => c.id === '22222222-2222-4222-8222-222222222222');
    expect(cmp?.name).toBe('New');
    expect(cmp?.subject_fr).toBe('Hello {prenom}');
    expect(cmp?.body_fr).toBe('<p>new body</p>');
    // RESET du flag test obligatoire.
    expect(cmp?.test_email_sent_at).toBeNull();
  });

  it("campagne 'sent' -> ok:false (interdit d editer)", async () => {
    state.campaigns[0].status = 'sent';
    mockEnv();
    const { editCampaignAction } = await import('./actions');
    const r = await editCampaignAction({
      campaign_id: '22222222-2222-4222-8222-222222222222',
      name: 'New',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain('sent');
  });

  it("campagne 'error' -> ok:false (interdit d editer)", async () => {
    state.campaigns[0].status = 'error';
    mockEnv();
    const { editCampaignAction } = await import('./actions');
    const r = await editCampaignAction({
      campaign_id: '22222222-2222-4222-8222-222222222222',
      name: 'New',
    });
    expect(r.ok).toBe(false);
  });

  it('scheduled : modifiable (status reste scheduled si scheduled_at set)', async () => {
    state.campaigns[0].status = 'scheduled';
    mockEnv();
    const { editCampaignAction } = await import('./actions');
    const r = await editCampaignAction({
      campaign_id: '22222222-2222-4222-8222-222222222222',
      name: 'Updated',
    });
    expect(r.ok).toBe(true);
  });

  it('campagne inexistante -> ok:false', async () => {
    mockEnv();
    const { editCampaignAction } = await import('./actions');
    const r = await editCampaignAction({
      campaign_id: '00000000-0000-4000-8000-000000000000',
      name: 'X',
    });
    expect(r.ok).toBe(false);
  });
});
