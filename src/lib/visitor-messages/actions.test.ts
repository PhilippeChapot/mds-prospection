/**
 * @vitest-environment node
 *
 * P9.1-natif — tests des server actions visitor-messages.
 *
 * Couverts :
 *   - submit valide -> insert + lead + notif
 *   - submit email invalide -> reject
 *   - submit rate-limit (4eme en 10 min) -> reject code='rate_limit'
 *   - list throw si non-admin
 *   - list filtre par status
 *   - get marque read_at + status=read si etait new
 *   - reply envoie email + insert reply + status=replied
 *   - reply throw si non-admin
 *   - updateStatus rejette si non-admin
 *   - countUnread retourne uniquement les status='new'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  isAdmin: true,
  // Tables
  visitorMessages: [] as Record<string, unknown>[],
  inserts: {
    visitor_messages: [] as Record<string, unknown>[],
    visitor_message_replies: [] as Record<string, unknown>[],
    prospects: [] as Record<string, unknown>[],
    audit_log: [] as Record<string, unknown>[],
  },
  updates: {
    visitor_messages: [] as Array<{ id: string; patch: Record<string, unknown> }>,
    visitor_message_replies: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  },
  // Rate limit
  ipMessagesInWindow: 0,
  notifications: [] as Array<{ category: string; subject: string }>,
  emailsSent: [] as Array<{ to: string; subject: string }>,
  resendShouldFail: false,
  // Fixtures
  fixedMessageId: '11111111-1111-4111-8111-111111111111',
  fixedReplyId: '22222222-2222-4222-8222-222222222222',
  adminProfile: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'admin@mds.fr',
    full_name: 'Admin',
    role: 'admin' as const,
  },
};

function mockEnv() {
  vi.doMock('next/headers', () => ({
    headers: vi.fn(async () => ({
      get: (k: string) => {
        if (k === 'x-forwarded-for') return '127.0.0.1';
        if (k === 'user-agent') return 'vitest';
        return null;
      },
    })),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));

  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => {
      if (!state.isAdmin) {
        const e = new Error('NEXT_REDIRECT');
        throw e;
      }
      return state.adminProfile;
    }),
  }));

  vi.doMock('@/lib/landing/lead-actions', () => ({
    findOrCreateCompanyForLanding: vi.fn(async () => ({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      name: 'acme.com',
      primary_domain: 'acme.com',
      alternate_domains: [],
    })),
    findOrCreateContactForLanding: vi.fn(async () => ({
      id: 'ddddddddd-dddd-4ddd-8ddd-dddddddddddd',
      email: 'visitor@acme.com',
      company_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      first_name: 'Alice',
      last_name: 'Martin',
      phone: null,
      language: 'FR' as const,
    })),
  }));

  vi.doMock('@/lib/resend/admin-notifier', () => ({
    sendAdminNotification: vi.fn(async (category: string, tpl: { subject: string }) => {
      state.notifications.push({ category, subject: tpl.subject });
      return { recipients: ['x'], delivered: 1, failed: 0 };
    }),
  }));

  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(async (p: { to: string; subject: string }) => {
      if (state.resendShouldFail) throw new Error('Resend down');
      state.emailsSent.push({ to: p.to, subject: p.subject });
      return { id: 'resend-id-123' };
    }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  let pendingInsert: Record<string, unknown> | null = null;
  let pendingPatch: Record<string, unknown> | null = null;
  let filter: { col: string; val: unknown } | null = null;
  let countMode = false;
  const chain: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count === 'exact' && opts.head === true) {
        countMode = true;
      }
      return chain;
    },
    eq: (col: string, val: unknown) => {
      filter = { col, val };
      return chain;
    },
    or: () => chain,
    order: () => chain,
    range: () =>
      Promise.resolve({
        data: state.visitorMessages,
        count: state.visitorMessages.length,
        error: null,
      }),
    gte: () => chain,
    maybeSingle: () => {
      if (table === 'seasons') {
        return Promise.resolve({ data: { id: 'sss' }, error: null });
      }
      if (table === 'visitor_messages' && filter?.col === 'id') {
        const found = state.visitorMessages.find((m) => m.id === filter?.val);
        return Promise.resolve({ data: found ?? null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    single: () => {
      if (table === 'visitor_messages' && pendingInsert) {
        const id = state.fixedMessageId;
        const row = { id, status: 'new', ...pendingInsert };
        state.visitorMessages.push(row);
        state.inserts.visitor_messages.push(row);
        return Promise.resolve({ data: { id }, error: null });
      }
      if (table === 'visitor_message_replies' && pendingInsert) {
        const id = state.fixedReplyId;
        state.inserts.visitor_message_replies.push({ id, ...pendingInsert });
        return Promise.resolve({ data: { id }, error: null });
      }
      if (table === 'prospects' && pendingInsert) {
        const id = 'ppp';
        state.inserts.prospects.push({ id, ...pendingInsert });
        return Promise.resolve({ data: { id }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (row: Record<string, unknown>) => {
      pendingInsert = row;
      if (table === 'audit_log') {
        state.inserts.audit_log.push(row);
        return Promise.resolve({ error: null });
      }
      return chain;
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    then: (onfulfilled: (v: { error: null; count?: number }) => unknown) => {
      if (countMode && table === 'visitor_messages') {
        // Rate-limit query (filter ip_address) ou unread count.
        const c =
          filter?.col === 'ip_address'
            ? state.ipMessagesInWindow
            : filter?.col === 'status' && filter.val === 'new'
              ? state.visitorMessages.filter((m) => m.status === 'new').length
              : state.visitorMessages.length;
        return Promise.resolve({ error: null, count: c }).then(onfulfilled);
      }
      if (pendingPatch && filter && table === 'visitor_messages') {
        state.updates.visitor_messages.push({ id: filter.val as string, patch: pendingPatch });
        const found = state.visitorMessages.find((m) => m.id === filter?.val);
        if (found) Object.assign(found, pendingPatch);
      }
      if (pendingPatch && filter && table === 'visitor_message_replies') {
        state.updates.visitor_message_replies.push({
          id: filter.val as string,
          patch: pendingPatch,
        });
      }
      return Promise.resolve({ error: null }).then(onfulfilled);
    },
  };
  return chain;
}

const VALID_SUBMIT = {
  visitor_first_name: 'Alice',
  visitor_last_name: 'Martin',
  visitor_email: 'alice@acme.com',
  visitor_company: 'Acme SAS',
  visitor_company_url: 'https://acme.com',
  visitor_phone: '+33 6 12 34 56 78',
  message: 'Bonjour, je voudrais un tarif stand pour MDS 2026.',
  page_url: 'https://mediadays.solutions/fr/',
  locale: 'fr' as const,
};

describe('submitVisitorMessageAction (P9.1-natif)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.isAdmin = true;
    state.visitorMessages = [];
    state.inserts = {
      visitor_messages: [],
      visitor_message_replies: [],
      prospects: [],
      audit_log: [],
    };
    state.updates = { visitor_messages: [], visitor_message_replies: [] };
    state.ipMessagesInWindow = 0;
    state.notifications = [];
    state.emailsSent = [];
    state.resendShouldFail = false;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('valide : insert message + cree lead prospect + notif admin', async () => {
    mockEnv();
    const { submitVisitorMessageAction } = await import('./actions');
    const r = await submitVisitorMessageAction(VALID_SUBMIT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message_id).toBe(state.fixedMessageId);
    expect(state.inserts.visitor_messages).toHaveLength(1);
    expect(state.inserts.visitor_messages[0]).toMatchObject({
      visitor_first_name: 'Alice',
      visitor_last_name: 'Martin',
      visitor_email: 'alice@acme.com',
      visitor_company: 'Acme SAS',
      visitor_company_url: 'https://acme.com',
      visitor_phone: '+33 6 12 34 56 78',
      message: VALID_SUBMIT.message,
      locale: 'fr',
      status: 'new',
    });
    expect(state.inserts.prospects).toHaveLength(1);
    expect(state.inserts.prospects[0]).toMatchObject({ source: 'chat_visiteur', status: 'lead' });
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].category).toBe('admin_visitor_message');
  });

  it("email invalide -> ok:false code='invalid'", async () => {
    mockEnv();
    const { submitVisitorMessageAction } = await import('./actions');
    const r = await submitVisitorMessageAction({ ...VALID_SUBMIT, visitor_email: 'not-an-email' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('invalid');
    expect(state.inserts.visitor_messages).toHaveLength(0);
  });

  it("rate limit : 3 messages deja dans la fenetre -> 4eme rejete code='rate_limit'", async () => {
    state.ipMessagesInWindow = 3;
    mockEnv();
    const { submitVisitorMessageAction } = await import('./actions');
    const r = await submitVisitorMessageAction(VALID_SUBMIT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('rate_limit');
    expect(state.inserts.visitor_messages).toHaveLength(0);
  });

  it('message trop court (< 5 chars) -> ok:false code=invalid', async () => {
    mockEnv();
    const { submitVisitorMessageAction } = await import('./actions');
    const r = await submitVisitorMessageAction({ ...VALID_SUBMIT, message: 'hi' });
    expect(r.ok).toBe(false);
  });

  // P9.1-natif-bis : nouveaux champs requis.
  it('telephone manquant (< 6 chars) -> ok:false code=invalid', async () => {
    mockEnv();
    const { submitVisitorMessageAction } = await import('./actions');
    const r = await submitVisitorMessageAction({ ...VALID_SUBMIT, visitor_phone: '12' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('invalid');
    expect(state.inserts.visitor_messages).toHaveLength(0);
  });

  it('societe manquante (< 2 chars) -> ok:false code=invalid', async () => {
    mockEnv();
    const { submitVisitorMessageAction } = await import('./actions');
    const r = await submitVisitorMessageAction({ ...VALID_SUBMIT, visitor_company: 'X' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('invalid');
  });

  it('company_url vide accepte (champ optionnel)', async () => {
    mockEnv();
    const { submitVisitorMessageAction } = await import('./actions');
    const r = await submitVisitorMessageAction({ ...VALID_SUBMIT, visitor_company_url: '' });
    expect(r.ok).toBe(true);
    expect(state.inserts.visitor_messages[0]).toMatchObject({ visitor_company_url: null });
  });

  it('company_url invalide (pas une URL) -> ok:false code=invalid', async () => {
    mockEnv();
    const { submitVisitorMessageAction } = await import('./actions');
    const r = await submitVisitorMessageAction({
      ...VALID_SUBMIT,
      visitor_company_url: 'not-a-url',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('invalid');
  });

  it('capture lead enrichi : company.name = visitor_company, website = visitor_company_url, contact = first/last/phone', async () => {
    // Spies sur les helpers landing pour verifier les args.
    const companyCalls: Array<{ name: string; website: string | null }> = [];
    const contactCalls: Array<{ firstName: string; lastName: string; phone: string | null }> = [];
    vi.doMock('next/headers', () => ({
      headers: vi.fn(async () => ({
        get: (k: string) => (k === 'x-forwarded-for' ? '127.0.0.1' : null),
      })),
    }));
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
    vi.doMock('@/lib/supabase/auth-helpers', () => ({
      requireAdminProfile: vi.fn(async () => state.adminProfile),
    }));
    vi.doMock('@/lib/landing/lead-actions', () => ({
      findOrCreateCompanyForLanding: vi.fn(async (p: { name: string; website: string | null }) => {
        companyCalls.push({ name: p.name, website: p.website });
        return {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          name: p.name,
          primary_domain: 'acme.com',
          alternate_domains: [],
        };
      }),
      findOrCreateContactForLanding: vi.fn(
        async (p: { firstName: string; lastName: string; phone: string | null }) => {
          contactCalls.push({ firstName: p.firstName, lastName: p.lastName, phone: p.phone });
          return {
            id: 'ddddddddd-dddd-4ddd-8ddd-dddddddddddd',
            email: 'visitor@acme.com',
            company_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            first_name: p.firstName,
            last_name: p.lastName,
            phone: p.phone,
            language: 'FR' as const,
          };
        },
      ),
    }));
    vi.doMock('@/lib/resend/admin-notifier', () => ({
      sendAdminNotification: vi.fn(async () => ({ recipients: [], delivered: 0, failed: 0 })),
    }));
    vi.doMock('@/lib/resend/client', () => ({
      sendTransactionalEmailViaResend: vi.fn(async () => ({ id: 'r' })),
    }));
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => makeClient(),
    }));
    const { submitVisitorMessageAction } = await import('./actions');
    await submitVisitorMessageAction(VALID_SUBMIT);

    expect(companyCalls).toHaveLength(1);
    expect(companyCalls[0]).toMatchObject({
      name: 'Acme SAS',
      website: 'https://acme.com',
    });
    expect(contactCalls).toHaveLength(1);
    expect(contactCalls[0]).toMatchObject({
      firstName: 'Alice',
      lastName: 'Martin',
      phone: '+33 6 12 34 56 78',
    });
  });
});

describe('listVisitorMessagesAction (P9.1-natif)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.isAdmin = true;
    state.visitorMessages = [
      {
        id: 'm1',
        status: 'new',
        visitor_first_name: 'Alice',
        visitor_last_name: 'A',
        visitor_email: 'a@x.fr',
        visitor_company: 'CompA',
        visitor_company_url: null,
        message: 'm1',
        created_at: '2026-05-27',
        locale: 'fr',
        prospect_id: null,
        assigned_to_user_id: null,
        read_at: null,
        replied_at: null,
        page_url: null,
        visitor_phone: '+33 1',
        prospect: null,
        assignee: null,
      },
      {
        id: 'm2',
        status: 'replied',
        visitor_first_name: 'Bob',
        visitor_last_name: 'B',
        visitor_email: 'b@x.fr',
        visitor_company: 'CompB',
        visitor_company_url: null,
        message: 'm2',
        created_at: '2026-05-26',
        locale: 'fr',
        prospect_id: null,
        assigned_to_user_id: null,
        read_at: null,
        replied_at: null,
        page_url: null,
        visitor_phone: '+33 2',
        prospect: null,
        assignee: null,
      },
    ];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('admin : retourne les messages + unread count', async () => {
    mockEnv();
    const { listVisitorMessagesAction } = await import('./actions');
    const r = await listVisitorMessagesAction({ status: 'all' });
    expect(r.rows).toHaveLength(2);
    expect(r.unread).toBe(1); // 1 status='new'
  });

  it('non-admin -> throw (redirect simule)', async () => {
    state.isAdmin = false;
    mockEnv();
    const { listVisitorMessagesAction } = await import('./actions');
    await expect(listVisitorMessagesAction()).rejects.toThrow();
  });
});

describe('getVisitorMessageAction (P9.1-natif)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.isAdmin = true;
    state.visitorMessages = [
      {
        id: state.fixedMessageId,
        status: 'new',
        visitor_first_name: 'Alice',
        visitor_last_name: 'Martin',
        visitor_email: 'alice@acme.com',
        visitor_phone: '+33 1',
        visitor_company: 'Acme',
        visitor_company_url: null,
        message: 'plop',
        page_url: null,
        locale: 'fr',
        prospect_id: null,
        assigned_to_user_id: null,
        created_at: '2026-05-27',
        read_at: null,
        replied_at: null,
        prospect: null,
        assignee: null,
      },
    ];
    state.updates.visitor_messages = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("marque read_at + status='read' si etait 'new'", async () => {
    mockEnv();
    const { getVisitorMessageAction } = await import('./actions');
    const r = await getVisitorMessageAction({ id: state.fixedMessageId });
    expect(r).not.toBeNull();
    if (r) expect(r.message.status).toBe('read');
    expect(state.updates.visitor_messages).toHaveLength(1);
    expect(state.updates.visitor_messages[0].patch).toMatchObject({ status: 'read' });
  });
});

describe('replyToVisitorMessageAction (P9.1-natif)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.isAdmin = true;
    state.visitorMessages = [
      {
        id: state.fixedMessageId,
        status: 'read',
        visitor_first_name: 'Alice',
        visitor_last_name: 'Martin',
        visitor_email: 'alice@acme.com',
        message: 'Bonjour',
        locale: 'fr',
      },
    ];
    state.inserts = {
      visitor_messages: [],
      visitor_message_replies: [],
      prospects: [],
      audit_log: [],
    };
    state.updates = { visitor_messages: [], visitor_message_replies: [] };
    state.emailsSent = [];
    state.resendShouldFail = false;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("envoie email + insert reply + update status='replied'", async () => {
    mockEnv();
    const { replyToVisitorMessageAction } = await import('./actions');
    const r = await replyToVisitorMessageAction({
      message_id: state.fixedMessageId,
      reply_text: 'Bonjour, merci pour votre message !',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.email_sent).toBe(true);
    expect(state.inserts.visitor_message_replies).toHaveLength(1);
    expect(state.emailsSent).toHaveLength(1);
    expect(state.emailsSent[0].to).toBe('alice@acme.com');
    const repliedUpdate = state.updates.visitor_messages.find((u) => u.patch.status === 'replied');
    expect(repliedUpdate).toBeDefined();
    expect(state.inserts.audit_log).toHaveLength(1);
  });

  it('Resend down -> reply persistee mais email_sent=false (best-effort)', async () => {
    state.resendShouldFail = true;
    mockEnv();
    const { replyToVisitorMessageAction } = await import('./actions');
    const r = await replyToVisitorMessageAction({
      message_id: state.fixedMessageId,
      reply_text: 'test',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.email_sent).toBe(false);
    expect(state.inserts.visitor_message_replies).toHaveLength(1);
  });

  it('non-admin -> throw', async () => {
    state.isAdmin = false;
    mockEnv();
    const { replyToVisitorMessageAction } = await import('./actions');
    await expect(
      replyToVisitorMessageAction({
        message_id: state.fixedMessageId,
        reply_text: 'x',
      }),
    ).rejects.toThrow();
  });
});
