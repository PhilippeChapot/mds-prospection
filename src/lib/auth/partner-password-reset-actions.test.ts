/**
 * P11.x — tests requestPartnerPasswordResetAction + consumePartnerPasswordResetAction.
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  contactId: '11111111-1111-1111-8111-111111111111',
  contactEmail: 'alice@acme.com',
  passwordHash: '$2a$12$somehash' as string | null,
  tokenRow: null as {
    token: string;
    contact_id: string;
    expires_at: string;
    used_at: string | null;
  } | null,
};

function makeClient() {
  return {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        ilike: () => chain,
        eq: () => chain,
        limit: () => chain,
        insert: () => Promise.resolve({ error: null }),
        update: () => chain,
        maybeSingle: () => {
          if (table === 'contacts') {
            return Promise.resolve({
              data: {
                id: state.contactId,
                first_name: 'Alice',
                password_hash: state.passwordHash,
              },
            });
          }
          if (table === 'partner_password_reset_tokens') {
            return Promise.resolve({ data: state.tokenRow });
          }
          return Promise.resolve({ data: null });
        },
      };
      return chain;
    },
  };
}

function mockDeps() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn().mockResolvedValue(undefined),
  }));
}

describe('requestPartnerPasswordResetAction (P11.x)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.passwordHash = '$2a$12$somehash';
    state.tokenRow = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it('envoie email si compte avec password déjà configuré', async () => {
    mockDeps();
    const { requestPartnerPasswordResetAction } = await import('./partner-password-reset-actions');
    const result = await requestPartnerPasswordResetAction({
      email: state.contactEmail,
      locale: 'fr',
    });
    expect(result.ok).toBe(true);
    expect('message' in result && result.message).toBeTruthy();
  });

  it('envoie email même si aucun password configuré (premier set)', async () => {
    state.passwordHash = null;
    const sendMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => makeClient(),
    }));
    vi.doMock('@/lib/resend/client', () => ({
      sendTransactionalEmailViaResend: sendMock,
    }));
    const { requestPartnerPasswordResetAction } = await import('./partner-password-reset-actions');
    const result = await requestPartnerPasswordResetAction({
      email: state.contactEmail,
      locale: 'fr',
    });
    expect(result.ok).toBe(true);
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it('retourne succès générique même si email inconnu (anti-enumeration)', async () => {
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from(_?: string) {
          return {
            select: () => this.from(''),
            ilike: () => this.from(''),
            limit: () => this.from(''),
            maybeSingle: () => Promise.resolve({ data: null }),
          };
        },
      }),
    }));
    vi.doMock('@/lib/resend/client', () => ({
      sendTransactionalEmailViaResend: vi.fn(),
    }));
    const { requestPartnerPasswordResetAction } = await import('./partner-password-reset-actions');
    const result = await requestPartnerPasswordResetAction({
      email: 'unknown@nobody.com',
      locale: 'en',
    });
    expect(result.ok).toBe(true);
  });
});

describe('consumePartnerPasswordResetAction (P11.x)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.tokenRow = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it('échoue avec token expiré', async () => {
    state.tokenRow = {
      token: 'abc'.repeat(20),
      contact_id: state.contactId,
      expires_at: new Date(Date.now() - 1000).toISOString(), // expiré
      used_at: null,
    };
    mockDeps();
    const { consumePartnerPasswordResetAction } = await import('./partner-password-reset-actions');
    const result = await consumePartnerPasswordResetAction({
      token: 'abc'.repeat(20),
      new_password: 'newPassword123',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('token_expired');
  });

  it('échoue avec token déjà utilisé', async () => {
    state.tokenRow = {
      token: 'abc'.repeat(20),
      contact_id: state.contactId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      used_at: new Date().toISOString(), // déjà utilisé
    };
    mockDeps();
    const { consumePartnerPasswordResetAction } = await import('./partner-password-reset-actions');
    const result = await consumePartnerPasswordResetAction({
      token: 'abc'.repeat(20),
      new_password: 'newPassword123',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('token_already_used');
  });
});
