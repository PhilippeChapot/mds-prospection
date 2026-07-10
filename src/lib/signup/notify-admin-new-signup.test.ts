/**
 * @vitest-environment node
 *
 * MDS-Prospection-SignupNotifs+Badge — tests notifyAdminNewSignup.
 *
 * Couvre :
 *   - signup complet (step2 soumis) -> envoi mail avec etape 2/2
 *   - signup incomplet (step2 non soumis) -> envoi mail quand meme, etape 1/2
 *   - echec sendAdminNotification -> ne throw jamais (best-effort)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendAdminNotificationMock = vi.fn();

vi.mock('@/lib/resend/admin-notifier', () => ({
  sendAdminNotification: (category: string, template: unknown) =>
    sendAdminNotificationMock(category, template),
}));

import { notifyAdminNewSignup } from './notify-admin-new-signup';

const BASE_INPUT = {
  id: 'aa000000-0000-0000-0000-000000000001',
  email: 'jdoe@acme.fr',
  companyName: 'ACME Radio',
  firstName: 'Jean',
  lastName: 'Doe',
  category: 'partenaire',
  language: 'FR' as const,
  createdAt: '2026-07-10T10:00:00.000Z',
  baseUrl: 'https://app.test',
};

describe('notifyAdminNewSignup', () => {
  beforeEach(() => {
    sendAdminNotificationMock.mockReset();
    sendAdminNotificationMock.mockResolvedValue({
      recipients: ['philippe@mediadays.solutions'],
      delivered: 1,
      failed: 0,
    });
  });

  it('signup incomplet (step2SubmittedAt=null) -> envoi mail avec etape 1/2', async () => {
    await notifyAdminNewSignup({ ...BASE_INPUT, step2SubmittedAt: null });

    expect(sendAdminNotificationMock).toHaveBeenCalledTimes(1);
    const [category, template] = sendAdminNotificationMock.mock.calls[0];
    expect(category).toBe('admin_signup_recu');
    expect(template.subject).toContain('ACME Radio');
    expect(template.html).toContain('1/2');
    expect(template.html).toContain(
      'https://app.test/admin/signups/aa000000-0000-0000-0000-000000000001',
    );
  });

  it('signup complet (step2SubmittedAt renseigne) -> etape 2/2', async () => {
    await notifyAdminNewSignup({ ...BASE_INPUT, step2SubmittedAt: '2026-07-10T10:05:00.000Z' });

    const [, template] = sendAdminNotificationMock.mock.calls[0];
    expect(template.html).toContain('2/2');
  });

  it('echec sendAdminNotification -> ne throw pas (best-effort)', async () => {
    sendAdminNotificationMock.mockRejectedValueOnce(new Error('resend down'));

    await expect(
      notifyAdminNewSignup({ ...BASE_INPUT, step2SubmittedAt: null }),
    ).resolves.toBeUndefined();
  });

  it('companyName null -> fallback email dans subject', async () => {
    await notifyAdminNewSignup({ ...BASE_INPUT, companyName: null, step2SubmittedAt: null });

    const [, template] = sendAdminNotificationMock.mock.calls[0];
    expect(template.subject).toContain('jdoe@acme.fr');
  });
});
