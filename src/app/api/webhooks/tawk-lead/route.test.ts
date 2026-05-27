/**
 * @vitest-environment node
 *
 * P9.1 — tests du webhook /api/webhooks/tawk-lead.
 *
 * Couverts :
 *   - secret absent (DB)        -> 503
 *   - signature manquante       -> 401
 *   - signature invalide        -> 401
 *   - event hors scope          -> 200 skipped
 *   - lead avec email           -> 200 ok + prospect cree + notif appelee
 *   - payload sans email        -> 200 no_email + log pending, pas de prospect
 *   - dedup : meme email -> reutilise company + contact existants
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

const SECRET = 'topsecret-shared-with-tawk';

const state = {
  setting_secret: SECRET as string | null,
  insertedProspects: [] as Record<string, unknown>[],
  insertedSyncLogs: [] as Record<string, unknown>[],
  notifications: [] as Array<{ category: string; subject: string }>,
  // Helpers stub state
  companyCalls: 0,
  contactCalls: 0,
  fixedCompanyId: '11111111-1111-4111-8111-111111111111',
  fixedContactId: '22222222-2222-4222-8222-222222222222',
  fixedProspectId: '33333333-3333-4333-8333-333333333333',
  seasonId: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
};

function mockEnv() {
  vi.doMock('@/lib/admin/preferences/get-setting', () => ({
    getSetting: vi.fn(async (key: string, fallback: unknown) => {
      if (key === 'tawk_webhook_secret') return state.setting_secret ?? fallback;
      return fallback;
    }),
  }));

  vi.doMock('@/lib/landing/lead-actions', () => ({
    findOrCreateCompanyForLanding: vi.fn(async () => {
      state.companyCalls++;
      return {
        id: state.fixedCompanyId,
        name: 'Acme Corp',
        primary_domain: 'acme.com',
        alternate_domains: [],
      };
    }),
    findOrCreateContactForLanding: vi.fn(async (p: { email: string }) => {
      state.contactCalls++;
      return {
        id: state.fixedContactId,
        email: p.email,
        company_id: state.fixedCompanyId,
        first_name: 'Alice',
        last_name: 'Martin',
        phone: null,
        language: 'FR' as const,
      };
    }),
  }));

  vi.doMock('@/lib/resend/admin-notifier', () => ({
    sendAdminNotification: vi.fn(async (category: string, tpl: { subject: string }) => {
      state.notifications.push({ category, subject: tpl.subject });
      return { recipients: ['x'], delivered: 1, failed: 0 };
    }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => makeChain(table),
    }),
  }));
}

function makeChain(table: string) {
  let pendingInsert: Record<string, unknown> | null = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => {
      if (table === 'seasons') {
        return Promise.resolve({ data: { id: state.seasonId }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    single: () => {
      if (table === 'prospects' && pendingInsert) {
        state.insertedProspects.push({ id: state.fixedProspectId, ...pendingInsert });
        return Promise.resolve({ data: { id: state.fixedProspectId }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (row: Record<string, unknown>) => {
      pendingInsert = row;
      if (table === 'sync_logs') {
        state.insertedSyncLogs.push(row);
        return Promise.resolve({ error: null });
      }
      return chain;
    },
  };
  return chain;
}

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha1', secret).update(body, 'utf8').digest('hex');
}

function makeRequest(body: object, opts: { signature?: string | null } = {}): Request {
  const raw = JSON.stringify(body);
  const sig = opts.signature === undefined ? sign(raw, SECRET) : opts.signature;
  return new Request('http://localhost/api/webhooks/tawk-lead', {
    method: 'POST',
    body: raw,
    headers: {
      'content-type': 'application/json',
      ...(sig ? { 'x-tawk-signature': sig } : {}),
    },
  });
}

const VALID_TICKET = {
  event: 'ticket:create',
  time: '2026-05-27T10:00:00.000Z',
  requester: { name: 'Alice Martin', email: 'alice@acme.com' },
  property: { id: 'p1', name: 'mediadays.solutions' },
  ticket: { id: 'tkt-1', humanId: '#1', subject: 'Hello', message: 'I want a booth' },
};

describe('POST /api/webhooks/tawk-lead (P9.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.setting_secret = SECRET;
    state.insertedProspects = [];
    state.insertedSyncLogs = [];
    state.notifications = [];
    state.companyCalls = 0;
    state.contactCalls = 0;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('secret non configure (vide) -> 503', async () => {
    state.setting_secret = '';
    mockEnv();
    const { POST } = await import('./route');
    const res = await POST(makeRequest(VALID_TICKET));
    expect(res.status).toBe(503);
  });

  it('header X-Tawk-Signature manquant -> 401', async () => {
    mockEnv();
    const { POST } = await import('./route');
    const res = await POST(makeRequest(VALID_TICKET, { signature: null }));
    expect(res.status).toBe(401);
  });

  it('signature invalide -> 401', async () => {
    mockEnv();
    const { POST } = await import('./route');
    const res = await POST(makeRequest(VALID_TICKET, { signature: 'aaaaaaaaaaaa' }));
    expect(res.status).toBe(401);
  });

  it('event chat:start (hors scope) -> 200 skipped + pas de prospect', async () => {
    mockEnv();
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ event: 'chat:start', visitor: { email: 'x@y.fr' } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBeDefined();
    expect(state.insertedProspects).toHaveLength(0);
  });

  it('ticket:create avec email -> 200 + prospect lead cree + notif admin', async () => {
    mockEnv();
    const { POST } = await import('./route');
    const res = await POST(makeRequest(VALID_TICKET));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.prospect_id).toBe(state.fixedProspectId);
    expect(state.insertedProspects).toHaveLength(1);
    expect(state.insertedProspects[0]).toMatchObject({
      source: 'chat_visiteur',
      status: 'lead',
      company_id: state.fixedCompanyId,
      primary_contact_id: state.fixedContactId,
    });
    // Notif admin envoyee
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].category).toBe('admin_chat_lead');
    expect(state.notifications[0].subject).toContain('Alice Martin');
    // sync_logs success
    const success = state.insertedSyncLogs.filter((l) => l.status === 'success');
    expect(success).toHaveLength(1);
    expect(success[0].target).toBe('tawk');
  });

  it('payload sans email (ticket:create requester.email manquant) -> 200 no_email + log pending + pas de prospect', async () => {
    mockEnv();
    const { POST } = await import('./route');
    const noEmail = {
      ...VALID_TICKET,
      requester: { name: 'NoEmail' },
    };
    const res = await POST(makeRequest(noEmail));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.no_email).toBe(true);
    expect(state.insertedProspects).toHaveLength(0);
    expect(state.notifications).toHaveLength(0);
    // sync_logs pending
    const pending = state.insertedSyncLogs.filter((l) => l.status === 'pending');
    expect(pending).toHaveLength(1);
  });

  it('dedup : 2 webhooks meme email -> findOrCreate appelle dedup (pas de doublon explicite cote handler)', async () => {
    mockEnv();
    const { POST } = await import('./route');
    await POST(makeRequest(VALID_TICKET));
    await POST(
      makeRequest({
        ...VALID_TICKET,
        ticket: { ...VALID_TICKET.ticket, id: 'tkt-2', message: 'Follow up' },
      }),
    );
    // findOrCreateCompanyForLanding + findOrCreateContactForLanding sont les
    // garde-fous dedup ; le handler n'introduit pas de doublon supplementaire.
    // Ils ont ete appeles 2 fois (1 par webhook) avec le meme email.
    expect(state.companyCalls).toBe(2);
    expect(state.contactCalls).toBe(2);
    // 2 prospects crees (1 par session — design : chaque chat = touche commerciale)
    expect(state.insertedProspects).toHaveLength(2);
  });
});
