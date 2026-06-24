/**
 * @vitest-environment node
 *
 * P16.x.PreProgrammeQuestionDrawer — submitPreProgrammeQuestionAction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface State {
  inserted: Array<Record<string, unknown>>;
  insertError: { message: string } | null;
  emailThrows: boolean;
  emails: Array<{ subject: string }>;
}
const state: State = { inserted: [], insertError: null, emailThrows: false, emails: [] };

function mockEnv() {
  vi.doMock('@/lib/landing/lead-actions', () => ({
    findOrCreateCompanyForLanding: vi.fn().mockResolvedValue({ id: 'co-1', name: 'Acme' }),
    findOrCreateContactForLanding: vi.fn().mockResolvedValue({ id: 'ct-1' }),
  }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    getActiveSeasonId: vi.fn().mockResolvedValue('season-1'),
  }));
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(async (p: { subject: string }) => {
      if (state.emailThrows) throw new Error('resend down');
      state.emails.push({ subject: p.subject });
      return { id: 'em' };
    }),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: () => ({
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () => {
              state.inserted.push(row);
              return Promise.resolve({
                data: state.insertError ? null : { id: 'p-1' },
                error: state.insertError,
              });
            },
          }),
        }),
      }),
    }),
  }));
}

const valid = {
  locale: 'fr' as const,
  org_name: 'Acme Media',
  first_name: 'Jean',
  last_name: 'Dupont',
  contact_email: 'jean@acme.fr',
  message: 'Quand sort le programme final ?',
};

beforeEach(() => {
  state.inserted = [];
  state.insertError = null;
  state.emailThrows = false;
  state.emails = [];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('submitPreProgrammeQuestionAction (P16.x)', () => {
  it('happy → prospect lead source_detail=preprogramme_drawer', async () => {
    mockEnv();
    const { submitPreProgrammeQuestionAction } = await import('./question-actions');
    const r = await submitPreProgrammeQuestionAction(valid);
    expect(r.ok).toBe(true);
    const row = state.inserted[0];
    expect(row.source).toBe('landing_form');
    expect(row.source_detail).toBe('preprogramme_drawer');
    expect(row.status).toBe('lead');
    expect(String(row.notes)).toContain('[Question pré-programme]');
    expect(String(row.notes)).toContain('programme final');
  });

  it('email invalide → erreur, pas d’insert', async () => {
    mockEnv();
    const { submitPreProgrammeQuestionAction } = await import('./question-actions');
    const r = await submitPreProgrammeQuestionAction({ ...valid, contact_email: 'pas-un-email' });
    expect(r.ok).toBe(false);
    expect(state.inserted).toHaveLength(0);
  });

  it('org_name trop court → erreur', async () => {
    mockEnv();
    const { submitPreProgrammeQuestionAction } = await import('./question-actions');
    const r = await submitPreProgrammeQuestionAction({ ...valid, org_name: 'A' });
    expect(r.ok).toBe(false);
  });

  it('sans message → notes = header seul', async () => {
    mockEnv();
    const { submitPreProgrammeQuestionAction } = await import('./question-actions');
    await submitPreProgrammeQuestionAction({ ...valid, message: '' });
    expect(state.inserted[0].notes).toBe('[Question pré-programme]');
  });

  it('email admin envoyé (best-effort)', async () => {
    mockEnv();
    const { submitPreProgrammeQuestionAction } = await import('./question-actions');
    await submitPreProgrammeQuestionAction(valid);
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0].subject).toContain('Question pré-programme');
  });

  it('email admin KO → action reste ok (best-effort)', async () => {
    state.emailThrows = true;
    mockEnv();
    const { submitPreProgrammeQuestionAction } = await import('./question-actions');
    const r = await submitPreProgrammeQuestionAction(valid);
    expect(r.ok).toBe(true);
  });

  it('insert prospect échoue → ok:false', async () => {
    state.insertError = { message: 'db down' };
    mockEnv();
    const { submitPreProgrammeQuestionAction } = await import('./question-actions');
    const r = await submitPreProgrammeQuestionAction(valid);
    expect(r.ok).toBe(false);
  });
});
