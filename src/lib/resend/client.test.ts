import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockSend = vi.fn();

vi.mock('resend', () => {
  class MockResend {
    emails = { send: mockSend };
  }
  return { Resend: MockResend };
});

// L'import doit venir APRES le mock pour que le helper utilise le mock.
import { sendTransactionalEmailViaResend, ResendError } from './client';

describe('sendTransactionalEmailViaResend', () => {
  beforeEach(() => {
    mockSend.mockReset();
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    vi.stubEnv('RESEND_SENDER_EMAIL', 'philippe@mediadays.solutions');
    vi.stubEnv('RESEND_SENDER_NAME', 'MediaDays Solutions');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns id on success and forwards correctly the payload', async () => {
    mockSend.mockResolvedValue({
      data: { id: 'resend-msg-123' },
      error: null,
    });

    const result = await sendTransactionalEmailViaResend({
      to: 'jean@example.com',
      toName: 'Jean Dupont',
      subject: 'Test subject',
      html: '<p>Hello</p>',
      text: 'Hello',
      tags: [{ name: 'category', value: 'doi' }],
    });

    expect(result.id).toBe('resend-msg-123');
    expect(mockSend).toHaveBeenCalledOnce();

    const call = mockSend.mock.calls[0][0];
    expect(call.from).toBe('MediaDays Solutions <philippe@mediadays.solutions>');
    expect(call.to).toEqual(['Jean Dupont <jean@example.com>']);
    expect(call.subject).toBe('Test subject');
    expect(call.html).toBe('<p>Hello</p>');
    expect(call.text).toBe('Hello');
    expect(call.replyTo).toBe('philippe@mediadays.solutions');
    expect(call.tags).toEqual([{ name: 'category', value: 'doi' }]);
  });

  it('skips toName formatting when not provided', async () => {
    mockSend.mockResolvedValue({ data: { id: 'r2' }, error: null });

    await sendTransactionalEmailViaResend({
      to: 'plain@example.com',
      subject: 's',
      html: 'h',
      text: 't',
    });

    const call = mockSend.mock.calls[0][0];
    expect(call.to).toEqual(['plain@example.com']);
  });

  it('throws ResendError when Resend returns an error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid `to` field', name: 'validation_error' },
    });

    await expect(
      sendTransactionalEmailViaResend({
        to: 'broken',
        subject: 's',
        html: 'h',
        text: 't',
      }),
    ).rejects.toThrow(ResendError);
  });

  it('throws when RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    // stubEnv with '' garde la cle mais vide -> notre check `if (!apiKey)` la
    // traite comme absente. On veut tester ce chemin.
    await expect(
      sendTransactionalEmailViaResend({
        to: 'foo@example.com',
        subject: 's',
        html: 'h',
        text: 't',
      }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});
