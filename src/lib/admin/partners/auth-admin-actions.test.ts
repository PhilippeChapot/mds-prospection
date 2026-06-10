/**
 * P11.x — tests actions admin auth partenaire.
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const UUID = '11111111-1111-1111-8111-111111111111';

const state = {
  contactId: UUID,
  contactEmail: 'alice@acme.com',
  passwordHash: '$2a$12$fakehash' as string | null,
};

function makeClient() {
  return {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        update: () => chain,
        maybeSingle: () => {
          if (table === 'contacts') {
            return Promise.resolve({
              data: {
                id: state.contactId,
                email: state.contactEmail,
                first_name: 'Alice',
                password_hash: state.passwordHash,
              },
            });
          }
          return Promise.resolve({ data: null });
        },
        insert: () => Promise.resolve({ error: null }),
      };
      return chain;
    },
  };
}

function mockAllDeps() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn().mockResolvedValue({ id: 'admin-uuid', role: 'admin' }),
    requireSuperAdmin: vi.fn().mockResolvedValue({ id: 'super-uuid', role: 'super_admin' }),
  }));
  vi.doMock('@/lib/espace-partenaire/jwt', () => ({
    signContactMagicToken: vi.fn().mockResolvedValue('mock-magic-token'),
  }));
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock('@/lib/resend/templates/espace-partenaire-magic-link', () => ({
    renderEspacePartenaireMagicLinkTemplate: vi.fn().mockReturnValue({
      subject: 'Magic link',
      html: '<p>link</p>',
      text: 'link',
    }),
  }));
  vi.doMock('@/lib/format/name', () => ({
    capitalizeName: (s: string) => s,
  }));
}

describe('auth-admin-actions (P11.x)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.passwordHash = '$2a$12$fakehash';
    mockAllDeps();
  });
  afterEach(() => vi.restoreAllMocks());

  it('adminTriggerMagicLinkAction : envoie le magic link et retourne ok:true', async () => {
    const { adminTriggerMagicLinkAction } = await import('./auth-admin-actions');
    const result = await adminTriggerMagicLinkAction({ contact_id: state.contactId });
    expect(result.ok).toBe(true);
  });

  it('adminTriggerPasswordResetAction : retourne ok:true même sans password configuré', async () => {
    state.passwordHash = null;
    vi.resetModules();
    mockAllDeps();
    const { adminTriggerPasswordResetAction } = await import('./auth-admin-actions');
    const result = await adminTriggerPasswordResetAction({ contact_id: state.contactId });
    expect(result.ok).toBe(true);
  });

  it('adminTriggerPasswordResetAction : retourne ok:true si password déjà configuré', async () => {
    const { adminTriggerPasswordResetAction } = await import('./auth-admin-actions');
    const result = await adminTriggerPasswordResetAction({ contact_id: state.contactId });
    expect(result.ok).toBe(true);
  });

  it('adminRemovePartnerPasswordAction : retourne ok:true avec super_admin', async () => {
    const { adminRemovePartnerPasswordAction } = await import('./auth-admin-actions');
    const result = await adminRemovePartnerPasswordAction({ contact_id: state.contactId });
    expect(result.ok).toBe(true);
  });
});
