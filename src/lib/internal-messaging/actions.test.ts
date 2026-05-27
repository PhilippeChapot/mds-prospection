/**
 * @vitest-environment node
 *
 * P9.2 — tests server actions messagerie interne.
 *
 * Couverts (11 tests minimum) :
 *   1. staff initie staff_dm vers user -> conversation cree, 2 participants
 *   2. staff initie support vers contact -> conversation cree
 *   3. contact initie support vers staff_pool -> conversation cree
 *   4. contact initie staff_dm -> REJET
 *   5. contact initie support vers un autre contact -> REJET
 *   6. sendMessage insere + notif email
 *   7. sendMessage rejette si non-participant
 *   8. listMy staff voit toutes les conversations (support + dm)
 *   9. listMy contact ne voit que ses conversations
 *  10. getConversation auto-update last_read_at
 *  11. countUnread compte les conversations non-lues
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  // Auth
  isStaff: true,
  staffProfile: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'alice@mds.fr',
    full_name: 'Alice MDS',
    role: 'admin' as const,
  },
  // Contact (espace exposant)
  contactId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  contactEmail: 'bob@acme.com',
  contactFirst: 'Bob',
  contactLast: 'Martin',
  prospectId: 'pppppppp-pppp-4ppp-8ppp-pppppppppppp',

  // Tables
  conversations: [] as Record<string, unknown>[],
  participants: [] as Record<string, unknown>[],
  messages: [] as Record<string, unknown>[],

  // Counters
  inserts: {
    conversations: [] as Record<string, unknown>[],
    participants: [] as Record<string, unknown>[],
    messages: [] as Record<string, unknown>[],
  },
  updates: { participants: [] as Array<{ filter: unknown; patch: Record<string, unknown> }> },
  emails: [] as Array<{ to: string; subject: string }>,
};

function mockEnv() {
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));

  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => {
      if (!state.isStaff) throw new Error('NEXT_REDIRECT');
      return state.staffProfile;
    }),
  }));

  vi.doMock('@/lib/espace-exposant/session', () => ({
    // P8.2-redirect-loop : les actions utilisent maintenant requireContactSession.
    requireContactSession: vi.fn(async () => ({
      contactId: state.contactId,
      prospectId: state.prospectId,
    })),
  }));

  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(async (p: { to: string; subject: string }) => {
      state.emails.push({ to: p.to, subject: p.subject });
      return { id: 'r1' };
    }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return {
    from: (table: string) => makeChain(table),
  };
}

function makeChain(table: string) {
  let pendingInsert: Record<string, unknown> | Record<string, unknown>[] | null = null;
  let pendingPatch: Record<string, unknown> | null = null;
  const filters: Array<{ col: string; val: unknown }> = [];
  const orFilters: string[] = [];
  let inFilter: { col: string; vals: unknown[] } | null = null;
  let countMode = false;

  const matchRow = (row: Record<string, unknown>): boolean => {
    for (const f of filters) {
      if (row[f.col] !== f.val) return false;
    }
    if (inFilter) {
      const v = row[inFilter.col];
      if (!inFilter.vals.includes(v)) return false;
    }
    return true;
  };

  const tableData = (): Record<string, unknown>[] => {
    if (table === 'conversation_participants') return state.participants;
    if (table === 'internal_conversations') return state.conversations;
    if (table === 'internal_messages') return state.messages;
    if (table === 'app_settings')
      return [{ key: 'admin_notification_emails', value: ['admin@mds.fr'] }];
    if (table === 'prospects')
      return [
        {
          id: state.prospectId,
          primary_contact_id: state.contactId,
          contact: {
            id: state.contactId,
            email: state.contactEmail,
            first_name: state.contactFirst,
            last_name: state.contactLast,
          },
        },
      ];
    if (table === 'users')
      return [
        {
          id: state.staffProfile.id,
          email: state.staffProfile.email,
          full_name: state.staffProfile.full_name,
          role: state.staffProfile.role,
          language: 'FR',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'charlie@mds.fr',
          full_name: 'Charlie',
          role: 'sales',
          language: 'FR',
        },
      ];
    if (table === 'contacts')
      return [
        {
          id: state.contactId,
          email: state.contactEmail,
          first_name: state.contactFirst,
          last_name: state.contactLast,
          language: 'FR',
          company: { name: 'Acme' },
        },
      ];
    return [];
  };

  const chain: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count === 'exact' && opts.head === true) countMode = true;
      return chain;
    },
    eq: (col: string, val: unknown) => {
      filters.push({ col, val });
      return chain;
    },
    neq: () => chain,
    in: (col: string, vals: unknown[]) => {
      inFilter = { col, vals };
      return chain;
    },
    or: (s: string) => {
      orFilters.push(s);
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    gt: () => chain,
    maybeSingle: () => {
      const rows = tableData().filter(matchRow);
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    single: () => {
      if (pendingInsert && !Array.isArray(pendingInsert)) {
        const id = `${table}-${state.inserts[table as 'conversations']?.length ?? 0}-${Date.now()}`;
        const row = { id, ...pendingInsert };
        if (table === 'internal_conversations') {
          state.conversations.push(row);
          state.inserts.conversations.push(row);
        }
        if (table === 'internal_messages') {
          state.messages.push(row);
          state.inserts.messages.push(row);
        }
        return Promise.resolve({ data: { id }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (rowOrRows: Record<string, unknown> | Record<string, unknown>[]) => {
      pendingInsert = rowOrRows;
      if (Array.isArray(rowOrRows)) {
        // bulk insert (ex: participants)
        for (const r of rowOrRows) {
          const id = `${table}-${state.participants.length}-${Date.now()}`;
          const row = { id, ...r };
          if (table === 'conversation_participants') {
            state.participants.push(row);
            state.inserts.participants.push(row);
          }
        }
        return Promise.resolve({ error: null });
      }
      return chain;
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    then: (onfulfilled: (v: { error: null; data?: unknown; count?: number }) => unknown) => {
      const rows = tableData().filter(matchRow);
      if (countMode) {
        return Promise.resolve({ error: null, count: rows.length }).then(onfulfilled);
      }
      if (pendingPatch) {
        for (const r of rows) Object.assign(r, pendingPatch);
        state.updates.participants.push({ filter: { filters, orFilters }, patch: pendingPatch });
        return Promise.resolve({ error: null }).then(onfulfilled);
      }
      return Promise.resolve({ data: rows, error: null }).then(onfulfilled);
    },
  };
  return chain;
}

function resetState() {
  state.isStaff = true;
  state.conversations = [];
  state.participants = [];
  state.messages = [];
  state.inserts = { conversations: [], participants: [], messages: [] };
  state.updates = { participants: [] };
  state.emails = [];
}

describe('createConversationAction (P9.2)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('staff -> staff_dm vers user : conversation cree avec 2 participants', async () => {
    mockEnv();
    const { createConversationAction } = await import('./actions');
    const r = await createConversationAction({
      type: 'staff_dm',
      recipient_type: 'user',
      recipient_id: '22222222-2222-4222-8222-222222222222',
      subject: 'Hello',
      initial_message: 'Salut Charlie',
    });
    expect(r.ok).toBe(true);
    expect(state.inserts.conversations).toHaveLength(1);
    expect(state.inserts.conversations[0]).toMatchObject({
      type: 'staff_dm',
      created_by_type: 'user',
    });
    expect(state.inserts.participants).toHaveLength(2);
    expect(state.inserts.messages).toHaveLength(1);
  });

  it('staff -> support vers contact : conversation cree', async () => {
    mockEnv();
    const { createConversationAction } = await import('./actions');
    const r = await createConversationAction({
      type: 'support',
      recipient_type: 'contact',
      recipient_id: state.contactId,
      initial_message: 'Bonjour Bob',
    });
    expect(r.ok).toBe(true);
    expect(state.inserts.conversations[0]).toMatchObject({ type: 'support' });
  });

  it('contact -> support vers staff_pool : conversation cree', async () => {
    mockEnv();
    const { createConversationAction } = await import('./actions');
    const r = await createConversationAction({
      as_contact: true,
      type: 'support',
      recipient_type: 'staff_pool',
      recipient_id: null,
      initial_message: 'Bonjour MDS',
    });
    expect(r.ok).toBe(true);
    expect(state.inserts.conversations[0]).toMatchObject({
      type: 'support',
      created_by_type: 'contact',
    });
    // 2 participants : contact + staff_pool
    expect(state.inserts.participants).toHaveLength(2);
  });

  it('contact -> staff_dm : REJET (interdit)', async () => {
    mockEnv();
    const { createConversationAction } = await import('./actions');
    const r = await createConversationAction({
      as_contact: true,
      type: 'staff_dm',
      recipient_type: 'user',
      recipient_id: state.staffProfile.id,
      initial_message: 'hi',
    });
    expect(r.ok).toBe(false);
  });

  it('contact -> support vers un autre contact : REJET', async () => {
    mockEnv();
    const { createConversationAction } = await import('./actions');
    const r = await createConversationAction({
      as_contact: true,
      type: 'support',
      recipient_type: 'contact',
      recipient_id: 'ddddddddd-dddd-4ddd-8ddd-dddddddddddd',
      initial_message: 'hi',
    });
    expect(r.ok).toBe(false);
  });
});

describe('sendMessageAction (P9.2)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    state.conversations = [
      {
        id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        type: 'support',
        subject: 'Test',
        created_at: '2026-05-27',
        last_message_at: '2026-05-27',
        archived_at: null,
      },
    ];
    state.participants = [
      {
        id: 'p1',
        conversation_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        participant_type: 'user',
        participant_id: state.staffProfile.id,
        last_read_at: null,
      },
      {
        id: 'p2',
        conversation_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        participant_type: 'contact',
        participant_id: state.contactId,
        last_read_at: null,
      },
    ];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('insert + notif email aux autres participants', async () => {
    mockEnv();
    const { sendMessageAction } = await import('./actions');
    const r = await sendMessageAction({
      conversation_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      body: 'Hello there',
    });
    expect(r.ok).toBe(true);
    expect(state.inserts.messages).toHaveLength(1);
    expect(state.emails.length).toBeGreaterThan(0);
    // Email envoye au contact (pas au staff lui-meme).
    expect(state.emails.some((e) => e.to === state.contactEmail)).toBe(true);
  });

  it('non-participant -> REJET', async () => {
    // Remplace les participants par d'autres ids -> le staff courant n'est pas membre.
    state.participants = [
      {
        id: 'p1',
        conversation_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        participant_type: 'user',
        participant_id: 'someone-else',
        last_read_at: null,
      },
    ];
    mockEnv();
    const { sendMessageAction } = await import('./actions');
    const r = await sendMessageAction({
      conversation_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      body: 'hack',
    });
    expect(r.ok).toBe(false);
    expect(state.inserts.messages).toHaveLength(0);
  });
});

describe('listMyConversationsAction / getConversation (P9.2)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    state.conversations = [
      {
        id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        type: 'support',
        subject: 'S',
        created_at: '2026-05-27',
        last_message_at: '2026-05-27',
        archived_at: null,
      },
      {
        id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
        type: 'staff_dm',
        subject: null,
        created_at: '2026-05-26',
        last_message_at: '2026-05-26',
        archived_at: null,
      },
    ];
    state.participants = [
      {
        id: 'p1',
        conversation_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        participant_type: 'contact',
        participant_id: state.contactId,
        last_read_at: null,
      },
      {
        id: 'p2',
        conversation_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        participant_type: 'staff_pool',
        participant_id: null,
        last_read_at: null,
      },
      {
        id: 'p3',
        conversation_id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
        participant_type: 'user',
        participant_id: state.staffProfile.id,
        last_read_at: null,
      },
      {
        id: 'p4',
        conversation_id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
        participant_type: 'user',
        participant_id: '22222222-2222-4222-8222-222222222222',
        last_read_at: null,
      },
    ];
    state.messages = [
      {
        id: 'm1',
        conversation_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        sender_type: 'contact',
        sender_id: state.contactId,
        body: 'Hello team',
        created_at: '2026-05-27',
      },
    ];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('staff voit toutes les conversations (support + staff_dm dont il est membre)', async () => {
    mockEnv();
    const { listMyConversationsAction } = await import('./actions');
    const list = await listMyConversationsAction();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const ids = list.map((c) => c.id);
    expect(ids).toContain('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
    expect(ids).toContain('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb');
  });

  it('contact ne voit que SES conversations', async () => {
    mockEnv();
    const { listMyConversationsAction } = await import('./actions');
    const list = await listMyConversationsAction({ as_contact: true, locale: 'fr' });
    const ids = list.map((c) => c.id);
    expect(ids).toContain('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
    expect(ids).not.toContain('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb');
  });

  it('getConversationAction auto-update last_read_at du viewer', async () => {
    mockEnv();
    const { getConversationAction } = await import('./actions');
    const r = await getConversationAction({
      conversation_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    });
    expect(r).not.toBeNull();
    // Patch last_read_at applique.
    const patchedRead = state.updates.participants.some(
      (u) => 'last_read_at' in u.patch && u.patch.last_read_at !== null,
    );
    expect(patchedRead).toBe(true);
  });
});

describe('countUnreadConversationsAction (P9.2)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    state.conversations = [
      {
        id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        type: 'support',
        subject: null,
        created_at: '2026-05-27',
        last_message_at: '2026-05-27',
        archived_at: null,
      },
    ];
    state.participants = [
      {
        id: 'p1',
        conversation_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        participant_type: 'user',
        participant_id: state.staffProfile.id,
        last_read_at: null,
      },
    ];
    state.messages = [
      {
        id: 'm1',
        conversation_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        sender_type: 'contact',
        sender_id: state.contactId,
        body: 'Unread',
        created_at: '2026-05-27',
      },
    ];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('compte les conversations avec messages non-lus pour le viewer staff', async () => {
    mockEnv();
    const { countUnreadConversationsAction } = await import('./actions');
    const n = await countUnreadConversationsAction();
    expect(n).toBeGreaterThanOrEqual(1);
  });
});
