/**
 * @vitest-environment node
 *
 * P12.x micro-fix — resolveTemplateVarsAction (résolution variables au clic).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface State {
  contact: Record<string, unknown> | null;
  companyName: string | null;
  amount: number | null;
}
const state: State = { contact: null, companyName: null, amount: null };

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'u1', role: 'admin', email: 'a@b' }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/email/imap-sync', () => ({ syncEmailAccount: vi.fn() }));
  vi.doMock('@/lib/email/account-config', () => ({ resolveAccountConfig: vi.fn() }));
  vi.doMock('@/lib/email/test-connection', () => ({ testEmailAccountConnection: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'contacts') {
          return {
            select: () => ({
              ilike: () => ({ maybeSingle: () => Promise.resolve({ data: state.contact }) }),
            }),
          };
        }
        if (table === 'companies') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: state.companyName ? { name: state.companyName } : null }),
              }),
            }),
          };
        }
        if (table === 'prospects') {
          return {
            select: () => ({
              eq: () => ({
                not: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () =>
                        Promise.resolve({
                          data: state.amount != null ? { estimated_amount: state.amount } : null,
                        }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    }),
  }));
}

beforeEach(() => {
  state.contact = null;
  state.companyName = null;
  state.amount = null;
});
afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('resolveTemplateVarsAction (P12.x fix)', () => {
  it('contact MDS → résout contact + company + montant', async () => {
    state.contact = {
      first_name: 'Jean',
      last_name: 'Dupont',
      email: 'jean@acme.fr',
      company_id: 'co-1',
    };
    state.companyName = 'Acme Media';
    state.amount = 7630;
    mockEnv();
    const { resolveTemplateVarsAction } = await import('./actions');
    const r = await resolveTemplateVarsAction('jean@acme.fr');
    expect(r.matched).toBe(true);
    expect(r.vars['contact.first_name']).toBe('Jean');
    expect(r.vars['company.name']).toBe('Acme Media');
    expect(r.vars['prospect.amount']).toBe('7630 €');
  });

  it('destinataire hors MDS → matched false, vars vides', async () => {
    mockEnv();
    const { resolveTemplateVarsAction } = await import('./actions');
    const r = await resolveTemplateVarsAction('ghost@nowhere.io');
    expect(r.matched).toBe(false);
    expect(Object.keys(r.vars)).toHaveLength(0);
  });

  it('email vide → matched false', async () => {
    mockEnv();
    const { resolveTemplateVarsAction } = await import('./actions');
    const r = await resolveTemplateVarsAction('   ');
    expect(r.matched).toBe(false);
  });
});
