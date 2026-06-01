/**
 * @vitest-environment node
 *
 * P8.5 — tests Vercel Cron consumer /api/cron/lifecycle/process.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  queue: [] as Array<{
    id: string;
    rule_id: string;
    contact_id: string;
    prospect_id: string | null;
    retry_count: number;
  }>,
  rules: new Map<
    string,
    {
      id: string;
      rule_key: string;
      pref_category: string;
      subject_fr: string;
      subject_en: string;
      body_fr_html: string;
      body_en_html: string;
    }
  >(),
  contacts: new Map<
    string,
    {
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      language: string;
      email_confidence: string;
      company: { name: string } | null;
    }
  >(),
  prefs: new Map<
    string,
    {
      contact_id: string;
      pref_general: boolean;
      pref_exposant: boolean;
      pref_facturation: boolean;
      pref_kit_media: boolean;
      pref_administration: boolean;
      pref_partenariat: boolean;
      pref_post_event: boolean;
      unsubscribed_all_at: string | null;
    }
  >(),
  updates: [] as Array<{ table: string; id: string; patch: Record<string, unknown> }>,
  sendBatchCalls: [] as Array<Record<string, unknown>>,
  sendBatchResult: {
    sent: 1,
    errors: [] as Array<{ contact_id: string; email: string; error_message: string }>,
    brevo_ids: [{ contact_id: 'auto', email: 'auto', message_id: 'msg-1' }],
  },
  sendBatchThrows: false,
};

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
  vi.doMock('@/lib/brevo/send-campaign', () => ({
    sendCampaignBatch: vi.fn(async (opts: Record<string, unknown>) => {
      state.sendBatchCalls.push(opts);
      if (state.sendBatchThrows) throw new Error('Brevo down');
      return state.sendBatchResult;
    }),
  }));
}

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  const filters: Array<{ op: string; col: string; val: unknown }> = [];
  let pendingPatch: Record<string, unknown> | null = null;
  const chain: Record<string, unknown> = {};

  const filterFn = (op: string) => (col: string, val: unknown) => {
    filters.push({ op, col, val });
    return chain;
  };
  Object.assign(chain, {
    select: () => chain,
    eq: filterFn('eq'),
    lte: filterFn('lte'),
    lt: filterFn('lt'),
    in: filterFn('in'),
    order: () => chain,
    limit: () => chain,
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    then: (cb: (v: { data: unknown; error: null }) => unknown) => {
      // Build a read result based on filters when no pending mutation.
      let data: unknown = [];
      if (!pendingPatch) {
        if (table === 'lifecycle_send_queue') {
          data = state.queue.filter((q) => q.retry_count < 3);
        } else if (table === 'lifecycle_rules') {
          const ruleIds = filters.find((f) => f.op === 'in' && f.col === 'id')?.val as
            | string[]
            | undefined;
          data = Array.from(state.rules.values()).filter((r) => !ruleIds || ruleIds.includes(r.id));
        } else if (table === 'contacts') {
          const contactIds = filters.find((f) => f.op === 'in' && f.col === 'id')?.val as
            | string[]
            | undefined;
          data = Array.from(state.contacts.values()).filter(
            (c) => !contactIds || contactIds.includes(c.id),
          );
        } else if (table === 'contact_preferences') {
          const contactIds = filters.find((f) => f.op === 'in' && f.col === 'contact_id')?.val as
            | string[]
            | undefined;
          data = Array.from(state.prefs.values()).filter(
            (p) => !contactIds || contactIds.includes(p.contact_id),
          );
        }
      } else {
        // Apply update.
        if (table === 'lifecycle_send_queue') {
          const idFilter = filters.find((f) => f.col === 'id');
          if (idFilter) {
            state.updates.push({
              table,
              id: String(idFilter.val),
              patch: pendingPatch,
            });
          }
        } else if (table === 'lifecycle_recipients') {
          state.updates.push({ table, id: 'recipients', patch: pendingPatch });
        }
      }
      return Promise.resolve({ data, error: null }).then(cb);
    },
  });
  return chain;
}

function resetState() {
  state.queue = [];
  state.rules.clear();
  state.contacts.clear();
  state.prefs.clear();
  state.updates = [];
  state.sendBatchCalls = [];
  state.sendBatchResult = {
    sent: 1,
    errors: [],
    brevo_ids: [{ contact_id: 'auto', email: 'auto', message_id: 'msg-1' }],
  };
  state.sendBatchThrows = false;
}

function seedRule(rule_key: string, pref_category: string = 'pref_general') {
  state.rules.set(`id-${rule_key}`, {
    id: `id-${rule_key}`,
    rule_key,
    pref_category,
    subject_fr: `Bonjour {prenom} - ${rule_key}`,
    subject_en: `Hello {prenom} - ${rule_key}`,
    body_fr_html: `<p>FR ${rule_key}</p>`,
    body_en_html: `<p>EN ${rule_key}</p>`,
  });
}

function seedContact(
  id: string,
  opts: Partial<{ language: string; email_confidence: string }> = {},
) {
  state.contacts.set(id, {
    id,
    email: `${id}@x.fr`,
    first_name: 'A',
    last_name: 'B',
    language: opts.language ?? 'FR',
    email_confidence: opts.email_confidence ?? 'verified',
    company: { name: 'AcmeCo' },
  });
  state.prefs.set(id, {
    contact_id: id,
    pref_general: true,
    pref_exposant: false,
    pref_facturation: false,
    pref_kit_media: false,
    pref_administration: false,
    pref_partenariat: false,
    pref_post_event: false,
    unsubscribed_all_at: null,
  });
}

function makeRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/cron/lifecycle/process', { headers });
}

describe('/api/cron/lifecycle/process (P8.5)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    process.env.CRON_SECRET = 'test-secret';
    process.env.BREVO_API_KEY = 'brevo-key';
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.com';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('401 sans CRON_SECRET valide', async () => {
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(makeRequest({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('401 sans header authorization', async () => {
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it('200 + 0 processed si queue vide', async () => {
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(body.sent).toBe(0);
  });

  it('200 + envoi reussi : queue marquee sent + brevo_message_id stocke', async () => {
    seedRule('signup_24h_no_quote');
    seedContact('c1');
    state.queue.push({
      id: 'q1',
      rule_id: 'id-signup_24h_no_quote',
      contact_id: 'c1',
      prospect_id: 'p1',
      retry_count: 0,
    });
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(state.sendBatchCalls).toHaveLength(1);
    const sentUpdate = state.updates.find(
      (u) => u.table === 'lifecycle_send_queue' && (u.patch.status as string) === 'sent',
    );
    expect(sentUpdate).toBeTruthy();
    expect(sentUpdate?.patch.brevo_message_id).toBe('msg-1');
  });

  it('routing EN : envoie subject_en/body_en pour contact.language=EN', async () => {
    seedRule('signup_24h_no_quote');
    seedContact('c-en', { language: 'EN' });
    state.queue.push({
      id: 'q-en',
      rule_id: 'id-signup_24h_no_quote',
      contact_id: 'c-en',
      prospect_id: null,
      retry_count: 0,
    });
    mockEnv();
    const { GET } = await import('./route');
    await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    const call = state.sendBatchCalls[0];
    expect(call.subject).toContain('Hello');
    expect(call.htmlContent).toContain('EN signup_24h_no_quote');
  });

  it('routing FR : envoie subject_fr/body_fr pour contact.language=FR', async () => {
    seedRule('signup_24h_no_quote');
    seedContact('c-fr', { language: 'FR' });
    state.queue.push({
      id: 'q-fr',
      rule_id: 'id-signup_24h_no_quote',
      contact_id: 'c-fr',
      prospect_id: null,
      retry_count: 0,
    });
    mockEnv();
    const { GET } = await import('./route');
    await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    const call = state.sendBatchCalls[0];
    expect(call.subject).toContain('Bonjour');
    expect(call.htmlContent).toContain('FR signup_24h_no_quote');
  });

  it('skip si unsubscribed_all_at post-queue', async () => {
    seedRule('signup_24h_no_quote');
    seedContact('c-unsub');
    const pref = state.prefs.get('c-unsub')!;
    pref.unsubscribed_all_at = '2026-06-01T00:00:00Z';
    state.queue.push({
      id: 'q-unsub',
      rule_id: 'id-signup_24h_no_quote',
      contact_id: 'c-unsub',
      prospect_id: null,
      retry_count: 0,
    });
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(state.sendBatchCalls).toHaveLength(0);
    const cancelUpdate = state.updates.find((u) => (u.patch.status as string) === 'cancelled');
    expect(cancelUpdate).toBeTruthy();
  });

  it('skip si pref categorie a false post-queue (defense in depth)', async () => {
    seedRule('post_event_2d_thanks', 'pref_post_event');
    seedContact('c-noprefpost');
    const pref = state.prefs.get('c-noprefpost')!;
    pref.pref_post_event = false;
    state.queue.push({
      id: 'q-noprefpost',
      rule_id: 'id-post_event_2d_thanks',
      contact_id: 'c-noprefpost',
      prospect_id: null,
      retry_count: 0,
    });
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(state.sendBatchCalls).toHaveLength(0);
  });

  it('skip email_confidence=low pour regle non-billing', async () => {
    seedRule('signup_24h_no_quote', 'pref_general');
    seedContact('c-low', { email_confidence: 'low' });
    state.queue.push({
      id: 'q-low',
      rule_id: 'id-signup_24h_no_quote',
      contact_id: 'c-low',
      prospect_id: null,
      retry_count: 0,
    });
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    const body = await res.json();
    expect(body.skipped).toBe(1);
  });

  it('email_confidence=low OK pour regle pref_facturation', async () => {
    seedRule('signed_3d_no_payment', 'pref_facturation');
    seedContact('c-low-billing', { email_confidence: 'low' });
    const pref = state.prefs.get('c-low-billing')!;
    pref.pref_facturation = true;
    state.queue.push({
      id: 'q-low-billing',
      rule_id: 'id-signed_3d_no_payment',
      contact_id: 'c-low-billing',
      prospect_id: null,
      retry_count: 0,
    });
    mockEnv();
    const { GET } = await import('./route');
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    const body = await res.json();
    expect(body.sent).toBe(1);
  });

  it('retry +5min si Brevo throw, status=pending tant que retry_count<3', async () => {
    seedRule('signup_24h_no_quote');
    seedContact('c-retry');
    state.queue.push({
      id: 'q-retry',
      rule_id: 'id-signup_24h_no_quote',
      contact_id: 'c-retry',
      prospect_id: null,
      retry_count: 0,
    });
    state.sendBatchThrows = true;
    mockEnv();
    const { GET } = await import('./route');
    await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    const update = state.updates.find((u) => u.id === 'q-retry');
    expect(update?.patch.status).toBe('pending');
    expect(update?.patch.retry_count).toBe(1);
    // scheduled_for repousse +5min
    const scheduledFor = new Date(update?.patch.scheduled_for as string).getTime();
    expect(scheduledFor).toBeGreaterThan(Date.now() + 4 * 60_000);
  });

  it('status=error apres 3 tentatives ratees', async () => {
    seedRule('signup_24h_no_quote');
    seedContact('c-final');
    state.queue.push({
      id: 'q-final',
      rule_id: 'id-signup_24h_no_quote',
      contact_id: 'c-final',
      prospect_id: null,
      retry_count: 2,
    });
    state.sendBatchThrows = true;
    mockEnv();
    const { GET } = await import('./route');
    await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    const update = state.updates.find((u) => u.id === 'q-final');
    expect(update?.patch.status).toBe('error');
  });
});
