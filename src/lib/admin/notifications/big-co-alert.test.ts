/**
 * @vitest-environment node
 *
 * P15.2 — tests Big Co alert (seuil + notification).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const emailCalls: Array<{ to: string; subject: string }> = [];
const updates: Array<Record<string, unknown>> = [];
const audits: Array<Record<string, unknown>> = [];

const scenario = {
  superAdmins: [{ email: 'boss@mds.fr', full_name: 'Big Boss' }] as Array<{
    email: string;
    full_name: string | null;
  }>,
};

function reset() {
  emailCalls.length = 0;
  updates.length = 0;
  audits.length = 0;
  scenario.superAdmins = [{ email: 'boss@mds.fr', full_name: 'Big Boss' }];
}

function mockClient() {
  return {
    from(table: string) {
      return {
        update(row: Record<string, unknown>) {
          updates.push(row);
          return { eq: () => Promise.resolve({ error: null }) };
        },
        select() {
          return { eq: () => Promise.resolve({ data: scenario.superAdmins, error: null }) };
        },
        insert(row: Record<string, unknown>) {
          if (table === 'audit_log') audits.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

function mockEnv() {
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(async (p: { to: string; subject: string }) => {
      emailCalls.push({ to: p.to, subject: p.subject });
      return { id: 'email-1' };
    }),
  }));
  vi.doMock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => mockClient() }));
}

async function load() {
  mockEnv();
  return import('./big-co-alert');
}

beforeEach(() => {
  vi.resetModules();
  reset();
});

describe('isBigCompany (P15.2)', () => {
  it('applique le seuil 1000', async () => {
    const { isBigCompany } = await load();
    expect(isBigCompany(1500)).toBe(true);
    expect(isBigCompany(1000)).toBe(false); // strictement supérieur
    expect(isBigCompany(500)).toBe(false);
    expect(isBigCompany(null)).toBe(false);
  });
});

describe('notifyBigCoVisitor (P15.2)', () => {
  it('marque is_big_company, notifie chaque super_admin, et logue l’audit', async () => {
    scenario.superAdmins = [
      { email: 'boss@mds.fr', full_name: 'Big Boss' },
      { email: 'phil@mds.fr', full_name: 'Phil' },
    ];
    const { notifyBigCoVisitor } = await load();
    await notifyBigCoVisitor('vi-1', {
      id: 'co-1',
      name: 'MégaCorp',
      employee_count: 5000,
      industry: 'media',
    });

    expect(updates[0]).toMatchObject({ is_big_company: true });
    expect(emailCalls).toHaveLength(2);
    expect(emailCalls.map((e) => e.to)).toContain('phil@mds.fr');
    expect(emailCalls[0].subject).toContain('MégaCorp');
    expect((audits[0].after as Record<string, unknown>).kind).toBe('big_co_alert_sent');
  });

  it('aucun super_admin → pas d’email mais flag + audit quand même', async () => {
    scenario.superAdmins = [];
    const { notifyBigCoVisitor } = await load();
    await notifyBigCoVisitor('vi-1', {
      id: 'co-1',
      name: 'MégaCorp',
      employee_count: 5000,
      industry: null,
    });
    expect(emailCalls).toHaveLength(0);
    expect(updates[0]).toMatchObject({ is_big_company: true });
    expect(audits).toHaveLength(1);
  });
});
