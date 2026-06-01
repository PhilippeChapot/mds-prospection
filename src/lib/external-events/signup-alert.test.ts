/**
 * @vitest-environment node
 *
 * P5.x.ExternalEvents — tests hook signup -> conversation interne.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  conversations: [] as Array<Record<string, unknown>>,
  participants: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>,
};

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  let pendingInsert: Record<string, unknown> | null = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    single: () => {
      if (table === 'internal_conversations' && pendingInsert) {
        const id = `conv-${state.conversations.length + 1}`;
        state.conversations.push({ id, ...pendingInsert });
        return Promise.resolve({ data: { id }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (row: Record<string, unknown>) => {
      pendingInsert = row;
      if (table === 'conversation_participants') state.participants.push(row);
      if (table === 'internal_messages') state.messages.push(row);
      return chain;
    },
    then: (cb: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(cb),
  };
  return chain;
}

function resetState() {
  state.conversations = [];
  state.participants = [];
  state.messages = [];
}

describe('triggerExternalEventSignupAlert (P5.x.ExternalEvents)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Signup matche 2 events -> conversation staff_broadcast priority=high', async () => {
    mockEnv();
    const { triggerExternalEventSignupAlert } = await import('./signup-alert');
    await triggerExternalEventSignupAlert({
      signupId: 'sig-1',
      signupEmail: 'a@b.fr',
      signupFirstName: 'A',
      signupLastName: 'B',
      companyId: 'co-1',
      companyName: 'AcmeCorp',
      externalEventTags: { prs: [2026], satis: [2025] },
    });
    expect(state.conversations).toHaveLength(1);
    const c = state.conversations[0];
    expect(c.type).toBe('staff_broadcast');
    expect(c.priority).toBe('high');
    expect(String(c.subject)).toContain('AcmeCorp');
    expect(String(c.subject)).toContain('PRS');
    expect(String(c.subject)).toContain('SATIS');
    // staff_pool participant cree.
    expect(state.participants.some((p) => p.participant_type === 'staff_pool')).toBe(true);
    // un message cree avec resume des events.
    expect(state.messages).toHaveLength(1);
    expect(String(state.messages[0].body)).toContain('Paris Radio Show');
  });

  it('Aucun event -> pas de conversation', async () => {
    mockEnv();
    const { triggerExternalEventSignupAlert } = await import('./signup-alert');
    await triggerExternalEventSignupAlert({
      signupId: 'sig-2',
      signupEmail: 'x@y.fr',
      signupFirstName: null,
      signupLastName: null,
      companyId: 'co-2',
      companyName: 'Empty',
      externalEventTags: {},
    });
    expect(state.conversations).toHaveLength(0);
  });

  it('Tags null -> pas de conversation', async () => {
    mockEnv();
    const { triggerExternalEventSignupAlert } = await import('./signup-alert');
    await triggerExternalEventSignupAlert({
      signupId: 'sig-3',
      signupEmail: 'x@y.fr',
      signupFirstName: null,
      signupLastName: null,
      companyId: 'co-3',
      companyName: 'Empty',
      externalEventTags: null,
    });
    expect(state.conversations).toHaveLength(0);
  });

  it('Metadata contient signup_id, company_id, matched_events', async () => {
    mockEnv();
    const { triggerExternalEventSignupAlert } = await import('./signup-alert');
    await triggerExternalEventSignupAlert({
      signupId: 'sig-meta',
      signupEmail: 'm@m.fr',
      signupFirstName: null,
      signupLastName: null,
      companyId: 'co-meta',
      companyName: 'MetaCo',
      externalEventTags: { rde: [2026] },
    });
    const meta = state.conversations[0].metadata as Record<string, unknown>;
    expect(meta.source).toBe('signup_external_event_match');
    expect(meta.signup_id).toBe('sig-meta');
    expect(meta.company_id).toBe('co-meta');
    expect(meta.matched_events).toEqual({ rde: [2026] });
  });
});
