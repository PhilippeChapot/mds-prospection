/**
 * P5.x.22 — tests sendLifecycleEmailToCompanyContacts.
 *
 * Validation :
 *   - envoie 1 email par contact eligible (sequential, distinct subject/firstname)
 *   - re-ordonne pour mettre primaryContactId en tête
 *   - skip si aucun contact eligible (lifecycle off partout)
 *   - error sur 1 contact n'arrête pas le batch
 *   - render reçoit le contact entier (peut interpoler firstName)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_BACKUP = { ...process.env };

interface Contact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  language: 'FR' | 'EN';
  is_primary: boolean;
}

function mockSupabase(contacts: Contact[]) {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              neq: () => ({
                order: () => ({
                  order: () => Promise.resolve({ data: contacts, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }));
}

describe('sendLifecycleEmailToCompanyContacts (P5.x.22)', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'rs_test';
    process.env.RESEND_FROM_EMAIL = 'philippe@mediadays.solutions';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    if (!ENV_BACKUP.RESEND_API_KEY) delete process.env.RESEND_API_KEY;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('sends 1 email per eligible contact with personalized render', async () => {
    mockSupabase([
      {
        id: 'c-1',
        email: 'alice@acme.com',
        first_name: 'Alice',
        last_name: 'A',
        language: 'FR',
        is_primary: true,
      },
      {
        id: 'c-2',
        email: 'bob@acme.com',
        first_name: 'Bob',
        last_name: 'B',
        language: 'EN',
        is_primary: false,
      },
    ]);
    const sendSpy = vi.fn().mockResolvedValue({ id: 'rs-1' });
    vi.doMock('@/lib/resend/client', () => ({ sendTransactionalEmailViaResend: sendSpy }));

    const { sendLifecycleEmailToCompanyContacts } = await import('./multi-recipient');
    const result = await sendLifecycleEmailToCompanyContacts({
      companyId: 'co-1',
      render: (c) => ({
        subject: `Hello ${c.first_name}`,
        html: `<p>${c.first_name}</p>`,
        text: c.first_name ?? '',
      }),
    });

    expect(result.attempted).toBe(2);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    const args = sendSpy.mock.calls.map((c) => c[0]);
    expect(args[0]?.subject).toBe('Hello Alice');
    expect(args[1]?.subject).toBe('Hello Bob');
  });

  it('puts primaryContactId first when reordering', async () => {
    mockSupabase([
      {
        id: 'c-1',
        email: 'a@b.com',
        first_name: 'A',
        last_name: null,
        language: 'FR',
        is_primary: false,
      },
      {
        id: 'c-2',
        email: 'c@d.com',
        first_name: 'C',
        last_name: null,
        language: 'FR',
        is_primary: true,
      },
    ]);
    const sendSpy = vi.fn().mockResolvedValue({ id: 'rs-1' });
    vi.doMock('@/lib/resend/client', () => ({ sendTransactionalEmailViaResend: sendSpy }));

    const { sendLifecycleEmailToCompanyContacts } = await import('./multi-recipient');
    await sendLifecycleEmailToCompanyContacts({
      companyId: 'co-1',
      primaryContactId: 'c-2',
      render: () => ({ subject: 's', html: 'h', text: 't' }),
    });

    const args = sendSpy.mock.calls.map((c) => c[0]);
    expect(args[0]?.to).toBe('c@d.com');
    expect(args[1]?.to).toBe('a@b.com');
  });

  it('returns 0 attempts when no eligible contacts', async () => {
    mockSupabase([]);
    const sendSpy = vi.fn();
    vi.doMock('@/lib/resend/client', () => ({ sendTransactionalEmailViaResend: sendSpy }));

    const { sendLifecycleEmailToCompanyContacts } = await import('./multi-recipient');
    const result = await sendLifecycleEmailToCompanyContacts({
      companyId: 'co-1',
      render: () => ({ subject: '', html: '', text: '' }),
    });

    expect(result.attempted).toBe(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('does not stop batch on individual send error', async () => {
    mockSupabase([
      {
        id: 'c-1',
        email: 'a@b.com',
        first_name: 'A',
        last_name: null,
        language: 'FR',
        is_primary: true,
      },
      {
        id: 'c-2',
        email: 'c@d.com',
        first_name: 'C',
        last_name: null,
        language: 'FR',
        is_primary: false,
      },
    ]);
    const sendSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'rs-2' });
    vi.doMock('@/lib/resend/client', () => ({ sendTransactionalEmailViaResend: sendSpy }));

    const { sendLifecycleEmailToCompanyContacts } = await import('./multi-recipient');
    const result = await sendLifecycleEmailToCompanyContacts({
      companyId: 'co-1',
      render: () => ({ subject: 's', html: 'h', text: 't' }),
    });

    expect(result.attempted).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.message).toMatch(/boom/);
  });

  it('passes EN/FR locale tag based on contact.language', async () => {
    mockSupabase([
      {
        id: 'c-en',
        email: 'en@x.com',
        first_name: 'En',
        last_name: null,
        language: 'EN',
        is_primary: true,
      },
    ]);
    const sendSpy = vi.fn().mockResolvedValue({ id: 'rs-1' });
    vi.doMock('@/lib/resend/client', () => ({ sendTransactionalEmailViaResend: sendSpy }));

    const { sendLifecycleEmailToCompanyContacts } = await import('./multi-recipient');
    await sendLifecycleEmailToCompanyContacts({
      companyId: 'co-1',
      tags: [{ name: 'category', value: 'devis' }],
      render: () => ({ subject: 's', html: 'h', text: 't' }),
    });

    const args = sendSpy.mock.calls[0]?.[0];
    expect(args.tags).toEqual(
      expect.arrayContaining([
        { name: 'category', value: 'devis' },
        { name: 'locale', value: 'en' },
      ]),
    );
  });
});
