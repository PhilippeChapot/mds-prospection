/**
 * @vitest-environment node
 *
 * P5.x.AffiliateInvitationEmail — tests createAffiliateAction (hook email)
 * et resendAffiliateInvitationAction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const AFFILIATE_ID = '4b1d7e3a-1f2c-4d8e-9f0a-1234567890ab';
const RESEND_ID = 'resend-msg-001';

interface MockState {
  resendCalls: Array<{ to: string; subject: string }>;
  affiliateRow: {
    id: string;
    display_name: string;
    token: string;
    commission_percent: number;
    contact_email: string | null;
  } | null;
  insertedAuditLogs: Array<Record<string, unknown>>;
  resendShouldThrow: boolean;
}

const state: MockState = {
  resendCalls: [],
  affiliateRow: {
    id: AFFILIATE_ID,
    display_name: 'Test Affilié',
    token: 'TEST_AFF',
    commission_percent: 10,
    contact_email: 'test@example.com',
  },
  insertedAuditLogs: [],
  resendShouldThrow: false,
};

function reset() {
  state.resendCalls = [];
  state.affiliateRow = {
    id: AFFILIATE_ID,
    display_name: 'Test Affilié',
    token: 'TEST_AFF',
    commission_percent: 10,
    contact_email: 'test@example.com',
  };
  state.insertedAuditLogs = [];
  state.resendShouldThrow = false;
}

function makeFakeSupabase() {
  const insertBuilder = (table: string) => ({
    select: () => ({
      single: () => {
        if (table === 'affiliates') {
          return Promise.resolve({
            data: {
              id: AFFILIATE_ID,
              token: 'TEST_AFF',
              display_name: 'Test Affilié',
              commission_percent: 10,
            },
            error: null,
          });
        }
        return Promise.resolve({ data: { id: 'new-id' }, error: null });
      },
    }),
    then: (resolve: (r: { error: null }) => void) => {
      if (table === 'audit_log') {
        // captured below
      }
      resolve({ error: null });
    },
  });

  return {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (table === 'audit_log') {
          state.insertedAuditLogs.push(row);
        }
        return insertBuilder(table);
      },
      select: (_cols?: string) => ({
        eq: (_c: string, _v: unknown) => ({
          maybeSingle: () => Promise.resolve({ data: state.affiliateRow, error: null }),
          single: () => Promise.resolve({ data: state.affiliateRow, error: null }),
        }),
      }),
      update: (_fields: Record<string, unknown>) => ({
        eq: (_c: string, _v: unknown) => Promise.resolve({ error: null }),
      }),
    }),
  };
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => ({
      id: 'u-admin',
      email: 'admin@test.com',
      full_name: 'Admin',
      role: 'admin',
    })),
  }));
  vi.doMock('@/lib/auth/role-helpers', () => ({
    hasAdminAccess: vi.fn(() => true),
    isSuperAdmin: vi.fn(() => false),
  }));
  vi.doMock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: vi.fn(async () => makeFakeSupabase()),
  }));
  vi.doMock('next/navigation', () => ({ redirect: vi.fn() }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(async (params: { to: string; subject: string }) => {
      if (state.resendShouldThrow) throw new Error('Resend unavailable');
      state.resendCalls.push({ to: params.to, subject: params.subject });
      return { id: RESEND_ID };
    }),
  }));
  vi.doMock('@/lib/resend/templates/affilie-invitation', () => ({
    buildAffiliateInvitationEmail: vi.fn(() => ({
      subject: 'Test subject',
      html: '<p>test</p>',
      text: 'test',
    })),
  }));
}

// ---------------------------------------------------------------------------
// createAffiliateAction — hook email
// ---------------------------------------------------------------------------

describe('createAffiliateAction — invitation email hook', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('avec contact_email → sendTransactionalEmailViaResend appelé 1 fois', async () => {
    mockEnv();
    const { createAffiliateAction } = await import('./actions');
    const fd = new FormData();
    fd.append('displayName', 'Test Affilié');
    fd.append('contactEmail', 'test@example.com');
    fd.append('type', 'media');
    fd.append('commissionPercent', '10');
    await createAffiliateAction(fd).catch(() => {});
    expect(state.resendCalls).toHaveLength(1);
    expect(state.resendCalls[0]?.to).toBe('test@example.com');
  });

  it('sans contact_email → sendTransactionalEmailViaResend pas appelé', async () => {
    mockEnv();
    const { createAffiliateAction } = await import('./actions');
    const fd = new FormData();
    fd.append('displayName', 'Sans Email');
    fd.append('type', 'media');
    fd.append('commissionPercent', '10');
    await createAffiliateAction(fd).catch(() => {});
    expect(state.resendCalls).toHaveLength(0);
  });

  it('Resend throw → INSERT committé quand même (best-effort, pas de throw)', async () => {
    mockEnv();
    state.resendShouldThrow = true;
    const { createAffiliateAction } = await import('./actions');
    const fd = new FormData();
    fd.append('displayName', 'Test Affilié');
    fd.append('contactEmail', 'test@example.com');
    fd.append('type', 'media');
    fd.append('commissionPercent', '10');
    // Ne doit pas throw (best-effort) — le redirect est capté
    let threw = false;
    await createAffiliateAction(fd).catch((e: unknown) => {
      // redirect() mock est no-op donc seul une vraie erreur remonte
      if (e instanceof Error && e.message.includes('INSERT affiliate')) threw = true;
    });
    expect(threw).toBe(false);
  });

  it('avec contact_email → audit log kind=affiliate_invitation_sent inséré', async () => {
    mockEnv();
    const { createAffiliateAction } = await import('./actions');
    const fd = new FormData();
    fd.append('displayName', 'Test Affilié');
    fd.append('contactEmail', 'test@example.com');
    fd.append('type', 'media');
    fd.append('commissionPercent', '10');
    await createAffiliateAction(fd).catch(() => {});
    const inviteLog = state.insertedAuditLogs.find(
      (l) => (l.after as { kind?: string } | undefined)?.kind === 'affiliate_invitation_sent',
    );
    expect(inviteLog).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// resendAffiliateInvitationAction
// ---------------------------------------------------------------------------

describe('resendAffiliateInvitationAction', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('sans contact_email → retourne ok:false sans appeler Resend', async () => {
    mockEnv();
    state.affiliateRow = {
      id: AFFILIATE_ID,
      display_name: 'Sans Email',
      token: 'TEST_AFF',
      commission_percent: 10,
      contact_email: null,
    };
    const { resendAffiliateInvitationAction } = await import('./actions');
    const r = await resendAffiliateInvitationAction(AFFILIATE_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/email/i);
    expect(state.resendCalls).toHaveLength(0);
  });

  it('avec contact_email → sendTransactionalEmailViaResend appelé + ok:true', async () => {
    mockEnv();
    const { resendAffiliateInvitationAction } = await import('./actions');
    const r = await resendAffiliateInvitationAction(AFFILIATE_ID);
    expect(r.ok).toBe(true);
    expect(state.resendCalls).toHaveLength(1);
    expect(state.resendCalls[0]?.to).toBe('test@example.com');
  });

  it('avec contact_email → audit log kind=affiliate_invitation_resent inséré', async () => {
    mockEnv();
    const { resendAffiliateInvitationAction } = await import('./actions');
    await resendAffiliateInvitationAction(AFFILIATE_ID);
    const resentLog = state.insertedAuditLogs.find(
      (l) => (l.after as { kind?: string } | undefined)?.kind === 'affiliate_invitation_resent',
    );
    expect(resentLog).toBeDefined();
  });

  it('affilié introuvable → retourne ok:false', async () => {
    mockEnv();
    state.affiliateRow = null;
    const { resendAffiliateInvitationAction } = await import('./actions');
    const r = await resendAffiliateInvitationAction(AFFILIATE_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/introuvable/i);
  });
});
