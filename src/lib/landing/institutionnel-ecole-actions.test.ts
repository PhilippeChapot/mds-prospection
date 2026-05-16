/**
 * @vitest-environment node
 *
 * P6.x.4-a — tests server action submitInstitutionnelEcoleRequest.
 *
 * Mocks :
 *   - getSupabaseServiceClient : capture insert payload
 *   - sendAdminNotification : capture call
 *   - sendTransactionalEmailViaResend : capture call
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const adminNotifMock = vi.fn();
const resendMock = vi.fn();
const insertedRows: Array<Record<string, unknown>> = [];

function mockEnv(opts: { insertOk?: boolean } = {}) {
  const insertOk = opts.insertOk ?? true;

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (_table: string) => ({
        insert: (payload: Record<string, unknown>) => {
          insertedRows.push(payload);
          return {
            select: () => ({
              single: () =>
                Promise.resolve(
                  insertOk
                    ? {
                        data: {
                          id: 'req-123',
                          created_at: '2026-05-17T10:00:00.000Z',
                        },
                        error: null,
                      }
                    : { data: null, error: { message: 'boom' } },
                ),
            }),
          };
        },
      }),
    }),
  }));

  vi.doMock('@/lib/resend/admin-notifier', () => ({
    sendAdminNotification: (...args: unknown[]) => {
      adminNotifMock(...args);
      return Promise.resolve({ recipients: ['x'], delivered: 1, failed: 0 });
    },
  }));

  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: (...args: unknown[]) => {
      resendMock(...args);
      return Promise.resolve();
    },
  }));
}

const VALID_INPUT = {
  type: 'institutionnel' as const,
  org_name: 'UDECAM',
  contact_name: 'Jean Test',
  contact_email: 'jean@udecam.com',
  contact_phone: '',
  website: '',
  message: '',
};

describe('submitInstitutionnelEcoleRequest (P6.x.4-a)', () => {
  beforeEach(() => {
    insertedRows.length = 0;
    adminNotifMock.mockReset();
    resendMock.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('refuse les inputs invalides (org_name trop court)', async () => {
    mockEnv();
    const { submitInstitutionnelEcoleRequest } = await import('./institutionnel-ecole-actions');
    const r = await submitInstitutionnelEcoleRequest({ ...VALID_INPUT, org_name: 'a' });
    expect(r.ok).toBe(false);
    expect(insertedRows).toHaveLength(0);
  });

  it('refuse les emails invalides', async () => {
    mockEnv();
    const { submitInstitutionnelEcoleRequest } = await import('./institutionnel-ecole-actions');
    const r = await submitInstitutionnelEcoleRequest({
      ...VALID_INPUT,
      contact_email: 'not-an-email',
    });
    expect(r.ok).toBe(false);
    expect(insertedRows).toHaveLength(0);
  });

  it('happy path : insert + admin email + client email', async () => {
    mockEnv();
    const { submitInstitutionnelEcoleRequest } = await import('./institutionnel-ecole-actions');
    const r = await submitInstitutionnelEcoleRequest(VALID_INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.request_id).toBe('req-123');
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].type).toBe('institutionnel');
    expect(insertedRows[0].org_name).toBe('UDECAM');
    expect(insertedRows[0].contact_email).toBe('jean@udecam.com');
    expect(adminNotifMock).toHaveBeenCalledTimes(1);
    expect(adminNotifMock.mock.calls[0][0]).toBe('admin_institutionnel_ecole_request');
    expect(resendMock).toHaveBeenCalledTimes(1);
    expect(resendMock.mock.calls[0][0].to).toBe('jean@udecam.com');
  });

  it('type=ecole change le wording du subject admin', async () => {
    mockEnv();
    const { submitInstitutionnelEcoleRequest } = await import('./institutionnel-ecole-actions');
    await submitInstitutionnelEcoleRequest({ ...VALID_INPUT, type: 'ecole', org_name: 'ECS' });
    expect(adminNotifMock.mock.calls[0][1].subject).toMatch(/École/);
  });

  it('renvoie ok=false si l’insert DB échoue', async () => {
    mockEnv({ insertOk: false });
    const { submitInstitutionnelEcoleRequest } = await import('./institutionnel-ecole-actions');
    const r = await submitInstitutionnelEcoleRequest(VALID_INPUT);
    expect(r.ok).toBe(false);
    expect(adminNotifMock).not.toHaveBeenCalled();
    expect(resendMock).not.toHaveBeenCalled();
  });
});
