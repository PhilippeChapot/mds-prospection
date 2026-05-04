import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendTransactionalEmail, BrevoError } from './client';

describe('sendTransactionalEmail', () => {
  const originalApiKey = process.env.BREVO_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.BREVO_API_KEY = 'test-key';
    process.env.BREVO_DOI_SENDER_EMAIL = 'philippe@mediadays.solutions';
    process.env.BREVO_DOI_SENDER_NAME = 'MediaDays Solutions';
  });

  afterEach(() => {
    if (originalApiKey !== undefined) process.env.BREVO_API_KEY = originalApiKey;
    else delete process.env.BREVO_API_KEY;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns messageId on success (201)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: '<abc@brevo>' }),
    } as Response);

    const result = await sendTransactionalEmail({
      to: [{ email: 'test@example.com', name: 'Test' }],
      templateId: 854,
      params: { firstName: 'Test' },
    });

    expect(result.messageId).toBe('<abc@brevo>');
    expect(global.fetch).toHaveBeenCalledOnce();
    const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.templateId).toBe(854);
    expect(body.to).toEqual([{ email: 'test@example.com', name: 'Test' }]);
    expect(body.sender.email).toBe('philippe@mediadays.solutions');
  });

  it('throws BrevoError with body on 4xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ code: 'invalid_parameter', message: 'Invalid headers' }),
    } as Response);

    await expect(
      sendTransactionalEmail({
        to: [{ email: 'test@example.com' }],
        templateId: 854,
      }),
    ).rejects.toThrow(BrevoError);
  });

  it('filters forbidden headers (X-Mailin-*, X-Sib-*)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: '<x@brevo>' }),
    } as Response);

    await sendTransactionalEmail({
      to: [{ email: 'test@example.com' }],
      templateId: 854,
      headers: {
        'X-Mailin-Track': false,
        'X-Sib-Track-Click': false,
        'X-Custom-Header': 'allowed-value',
      },
    });

    const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    // Les 2 headers interdits sont filtres, le custom passe.
    expect(body.headers).toEqual({ 'X-Custom-Header': 'allowed-value' });
    expect(body.headers).not.toHaveProperty('X-Mailin-Track');
    expect(body.headers).not.toHaveProperty('X-Sib-Track-Click');
  });

  it('throws when BREVO_API_KEY is missing', async () => {
    delete process.env.BREVO_API_KEY;
    await expect(
      sendTransactionalEmail({
        to: [{ email: 'test@example.com' }],
        templateId: 854,
      }),
    ).rejects.toThrow(/BREVO_API_KEY/);
  });
});
