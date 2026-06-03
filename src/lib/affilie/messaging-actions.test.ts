/**
 * @vitest-environment node
 *
 * P7.x.AffiliePitchsAndChat — tests server actions chat affilie.
 *
 * Cas critiques :
 *   - RGPD isolation : affilie A ne voit JAMAIS conv de B
 *   - startConversation cree type=staff_affilie + metadata.affiliate_id
 *   - replyAsAffilie verifie metadata.affiliate_id (defense in depth)
 *   - getDetail filtre metadata.affiliate_id strict
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  affiliateId: 'aff-A',
  affiliates: new Map<string, { id: string; display_name: string; contact_email: string }>(),
  conversations: new Map<
    string,
    {
      id: string;
      type: string;
      subject: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
      last_message_at: string;
      archived_at: string | null;
    }
  >(),
  participants: [] as Array<{
    conversation_id: string;
    participant_type: string;
    participant_id: string | null;
    last_read_at: string | null;
  }>,
  messages: [] as Array<{
    id: string;
    conversation_id: string;
    sender_type: string;
    sender_id: string;
    body: string;
    created_at: string;
  }>,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  resendCalls: [] as Array<Record<string, unknown>>,
};

function mockEnv() {
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('./session', () => ({
    requireAffilieSession: vi.fn(async () => ({ affiliateId: state.affiliateId })),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(async (opts: Record<string, unknown>) => {
      state.resendCalls.push(opts);
      return { id: 'r-mock' };
    }),
  }));
  vi.doMock('@/lib/resend/templates/internal-message-notification', () => ({
    renderInternalMessageNotification: () => ({
      subject: 'subj',
      html: '<p>html</p>',
      text: 'text',
    }),
  }));
}

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  const filters: Array<{ op: string; col: string; val: unknown }> = [];
  let pendingInsert: Record<string, unknown> | Record<string, unknown>[] | null = null;
  let pendingPatch: Record<string, unknown> | null = null;
  const chain: Record<string, unknown> = {};

  const filterFn = (op: string) => (col: string, val: unknown) => {
    filters.push({ op, col, val });
    return chain;
  };

  Object.assign(chain, {
    select: () => chain,
    eq: filterFn('eq'),
    neq: filterFn('neq'),
    in: filterFn('in'),
    gt: filterFn('gt'),
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => {
      if (table === 'affiliates') {
        const idFilter = filters.find((f) => f.col === 'id');
        if (idFilter) {
          const a = state.affiliates.get(String(idFilter.val));
          return Promise.resolve({ data: a ?? null, error: null });
        }
      }
      if (table === 'internal_conversations') {
        const idFilter = filters.find((f) => f.col === 'id');
        const affFilter = filters.find((f) => f.col === 'metadata->>affiliate_id');
        const typeFilter = filters.find((f) => f.col === 'type');
        if (idFilter) {
          const c = state.conversations.get(String(idFilter.val));
          if (!c) return Promise.resolve({ data: null, error: null });
          // Verifie filtres
          if (typeFilter && c.type !== typeFilter.val)
            return Promise.resolve({ data: null, error: null });
          if (affFilter && (c.metadata?.affiliate_id ?? null) !== affFilter.val) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: c, error: null });
        }
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
      pendingInsert = row;
      state.inserts.push({ table, row: Array.isArray(row) ? { items: row } : row });
      if (table === 'internal_conversations' && !Array.isArray(row)) {
        const id = `conv-${state.conversations.size + 1}`;
        state.conversations.set(id, {
          id,
          type: String(row.type),
          subject: (row.subject as string | null) ?? null,
          metadata: (row.metadata as Record<string, unknown> | null) ?? null,
          created_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          archived_at: null,
        });
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id }, error: null }),
          }),
        };
      }
      if (table === 'conversation_participants') {
        const items = Array.isArray(row) ? row : [row];
        for (const r of items) {
          state.participants.push({
            conversation_id: String(r.conversation_id),
            participant_type: String(r.participant_type),
            participant_id: (r.participant_id as string | null) ?? null,
            last_read_at: null,
          });
        }
        return Promise.resolve({ error: null });
      }
      if (table === 'internal_messages' && !Array.isArray(row)) {
        const id = `msg-${state.messages.length + 1}`;
        state.messages.push({
          id,
          conversation_id: String(row.conversation_id),
          sender_type: String(row.sender_type),
          sender_id: String(row.sender_id),
          body: String(row.body),
          created_at: new Date().toISOString(),
        });
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id }, error: null }),
          }),
        };
      }
      return Promise.resolve({ error: null });
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    then: (cb: (v: { data: unknown; error: null; count?: number }) => unknown) => {
      // Read paths.
      let data: unknown = [];
      if (!pendingPatch) {
        if (table === 'internal_conversations') {
          const affFilter = filters.find((f) => f.col === 'metadata->>affiliate_id');
          const typeFilter = filters.find((f) => f.col === 'type');
          data = Array.from(state.conversations.values()).filter(
            (c) =>
              (!affFilter || (c.metadata?.affiliate_id ?? null) === affFilter.val) &&
              (!typeFilter || c.type === typeFilter.val),
          );
        } else if (table === 'internal_messages') {
          const convFilter = filters.find((f) => f.col === 'conversation_id');
          data = state.messages.filter((m) =>
            convFilter ? m.conversation_id === convFilter.val : true,
          );
        } else if (table === 'conversation_participants') {
          const convFilter = filters.find((f) => f.col === 'conversation_id');
          const typeFilter = filters.find((f) => f.col === 'participant_type');
          const idFilter = filters.find((f) => f.col === 'participant_id');
          data = state.participants.filter(
            (p) =>
              (!convFilter || p.conversation_id === convFilter.val) &&
              (!typeFilter || p.participant_type === typeFilter.val) &&
              (!idFilter || p.participant_id === idFilter.val),
          );
        } else if (table === 'users') {
          data = [];
        } else if (table === 'app_settings') {
          data = null;
        }
      }
      void pendingInsert;
      return Promise.resolve({ data, error: null, count: 0 }).then(cb);
    },
  });
  return chain;
}

function resetState() {
  state.affiliateId = 'aff-A';
  state.affiliates.clear();
  state.affiliates.set('aff-A', {
    id: 'aff-A',
    display_name: 'Affilie A',
    contact_email: 'a@aff.fr',
  });
  state.affiliates.set('aff-B', {
    id: 'aff-B',
    display_name: 'Affilie B',
    contact_email: 'b@aff.fr',
  });
  state.conversations.clear();
  state.participants = [];
  state.messages = [];
  state.inserts = [];
  state.resendCalls = [];
}

describe('startConversationFromAffilieAction (P7.x.AffiliePitchsAndChat)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.com';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('cree conv type=staff_affilie + metadata.affiliate_id + participants affiliate+staff_pool + 1er message', async () => {
    mockEnv();
    const { startConversationFromAffilieAction } = await import('./messaging-actions');
    const r = await startConversationFromAffilieAction({
      locale: 'fr',
      subject: 'Test sujet',
      initial_message: 'Bonjour MDS',
    });
    expect(r.ok).toBe(true);
    // 1 conversation
    expect(state.conversations.size).toBe(1);
    const c = Array.from(state.conversations.values())[0];
    expect(c.type).toBe('staff_affilie');
    expect(c.metadata?.affiliate_id).toBe('aff-A');
    expect(c.subject).toBe('Test sujet');
    // 2 participants
    expect(state.participants).toHaveLength(2);
    expect(state.participants.find((p) => p.participant_type === 'affiliate')).toBeTruthy();
    expect(state.participants.find((p) => p.participant_type === 'staff_pool')).toBeTruthy();
    // 1 message
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].sender_type).toBe('affiliate');
    expect(state.messages[0].sender_id).toBe('aff-A');
    expect(state.messages[0].body).toBe('Bonjour MDS');
  });

  it('rejette si subject vide', async () => {
    mockEnv();
    const { startConversationFromAffilieAction } = await import('./messaging-actions');
    const r = await startConversationFromAffilieAction({
      locale: 'fr',
      subject: '   ',
      initial_message: 'Body OK',
    });
    expect(r.ok).toBe(false);
  });
});

describe('listMyConversationsForAffilieAction (P7.x.AffiliePitchsAndChat)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
  });
  afterEach(() => vi.restoreAllMocks());

  it('RGPD isolation : affilie A ne voit JAMAIS conv affilie B', async () => {
    // Pre-seed 2 conv : 1 pour A, 1 pour B
    state.conversations.set('c-A', {
      id: 'c-A',
      type: 'staff_affilie',
      subject: 'Conv A',
      metadata: { affiliate_id: 'aff-A' },
      created_at: '2026-06-01T10:00:00Z',
      last_message_at: '2026-06-01T10:00:00Z',
      archived_at: null,
    });
    state.conversations.set('c-B', {
      id: 'c-B',
      type: 'staff_affilie',
      subject: 'Conv B',
      metadata: { affiliate_id: 'aff-B' },
      created_at: '2026-06-01T10:00:00Z',
      last_message_at: '2026-06-01T10:00:00Z',
      archived_at: null,
    });
    state.affiliateId = 'aff-A';
    mockEnv();
    const { listMyConversationsForAffilieAction } = await import('./messaging-actions');
    const list = await listMyConversationsForAffilieAction('fr');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('c-A');
  });
});

describe('replyAsAffilieAction (P7.x.AffiliePitchsAndChat)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
  });
  afterEach(() => vi.restoreAllMocks());

  it("rejette si l'affilie tente de repondre dans une conv d'un AUTRE affilie", async () => {
    state.conversations.set('c-B', {
      id: 'c-B',
      type: 'staff_affilie',
      subject: 'Conv B',
      metadata: { affiliate_id: 'aff-B' },
      created_at: '2026-06-01T10:00:00Z',
      last_message_at: '2026-06-01T10:00:00Z',
      archived_at: null,
    });
    state.affiliateId = 'aff-A';
    mockEnv();
    const { replyAsAffilieAction } = await import('./messaging-actions');
    const r = await replyAsAffilieAction({
      locale: 'fr',
      conversation_id: '11111111-1111-4111-8111-111111111111', // UUID arbitraire
      body: 'Tentative intrusion',
    });
    expect(r.ok).toBe(false);
    // Aucun message inseree
    expect(state.messages).toHaveLength(0);
  });

  it('accepte si conv appartient bien a l affilie connecte', async () => {
    state.conversations.set('11111111-1111-4111-8111-111111111111', {
      id: '11111111-1111-4111-8111-111111111111',
      type: 'staff_affilie',
      subject: 'Conv A',
      metadata: { affiliate_id: 'aff-A' },
      created_at: '2026-06-01T10:00:00Z',
      last_message_at: '2026-06-01T10:00:00Z',
      archived_at: null,
    });
    state.affiliateId = 'aff-A';
    mockEnv();
    const { replyAsAffilieAction } = await import('./messaging-actions');
    const r = await replyAsAffilieAction({
      locale: 'fr',
      conversation_id: '11111111-1111-4111-8111-111111111111',
      body: 'Ma reponse',
    });
    expect(r.ok).toBe(true);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].sender_type).toBe('affiliate');
    expect(state.messages[0].sender_id).toBe('aff-A');
  });
});

describe('getConversationDetailForAffilieAction (P7.x.AffiliePitchsAndChat)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
  });
  afterEach(() => vi.restoreAllMocks());

  it('rejette si conv appartient a un autre affilie', async () => {
    state.conversations.set('11111111-1111-4111-8111-111111111111', {
      id: '11111111-1111-4111-8111-111111111111',
      type: 'staff_affilie',
      subject: 'Conv B',
      metadata: { affiliate_id: 'aff-B' },
      created_at: '2026-06-01T10:00:00Z',
      last_message_at: '2026-06-01T10:00:00Z',
      archived_at: null,
    });
    state.affiliateId = 'aff-A';
    mockEnv();
    const { getConversationDetailForAffilieAction } = await import('./messaging-actions');
    const r = await getConversationDetailForAffilieAction(
      '11111111-1111-4111-8111-111111111111',
      'fr',
    );
    expect(r.ok).toBe(false);
  });

  it('ok + retourne messages tries chronologiquement pour conv propre', async () => {
    state.conversations.set('11111111-1111-4111-8111-111111111111', {
      id: '11111111-1111-4111-8111-111111111111',
      type: 'staff_affilie',
      subject: 'Conv A',
      metadata: { affiliate_id: 'aff-A' },
      created_at: '2026-06-01T10:00:00Z',
      last_message_at: '2026-06-01T10:05:00Z',
      archived_at: null,
    });
    state.messages.push({
      id: 'm1',
      conversation_id: '11111111-1111-4111-8111-111111111111',
      sender_type: 'affiliate',
      sender_id: 'aff-A',
      body: 'Bonjour',
      created_at: '2026-06-01T10:00:00Z',
    });
    state.affiliateId = 'aff-A';
    mockEnv();
    const { getConversationDetailForAffilieAction } = await import('./messaging-actions');
    const r = await getConversationDetailForAffilieAction(
      '11111111-1111-4111-8111-111111111111',
      'fr',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.messages).toHaveLength(1);
      expect(r.data?.messages[0].is_mine).toBe(true);
      expect(r.data?.messages[0].sender_name).toBe('Vous');
    }
  });
});
