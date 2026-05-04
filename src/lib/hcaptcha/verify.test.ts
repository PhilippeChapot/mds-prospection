import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyHCaptchaToken } from './verify';

describe('verifyHCaptchaToken', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('HCAPTCHA_SECRET', '');
    // vi.stubEnv('', '') laisse la cle definie a "" — pour simuler vraiment
    // "non defini", on prefere la supprimer pour les tests bypass-dev.
    delete process.env.HCAPTCHA_SECRET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns success: false when token is empty', async () => {
    const result = await verifyHCaptchaToken('');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('missing-input-response');
  });

  it('bypasses in dev when no HCAPTCHA_SECRET is configured', async () => {
    const result = await verifyHCaptchaToken('any-token');
    expect(result.success).toBe(true);
  });

  it('rejects in production when no HCAPTCHA_SECRET configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const result = await verifyHCaptchaToken('any-token');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('missing-input-secret');
  });

  it('returns success: true when hCaptcha API confirms', async () => {
    vi.stubEnv('HCAPTCHA_SECRET', 'real-secret');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, hostname: 'mediadays.solutions' }),
    } as Response);

    const result = await verifyHCaptchaToken('valid-token');
    expect(result.success).toBe(true);
    expect(result.hostname).toBe('mediadays.solutions');
  });

  it('returns success: false when hCaptcha API rejects', async () => {
    vi.stubEnv('HCAPTCHA_SECRET', 'real-secret');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, 'error-codes': ['invalid-input-response'] }),
    } as Response);

    const result = await verifyHCaptchaToken('bad-token');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('invalid-input-response');
  });

  it('handles network errors gracefully', async () => {
    vi.stubEnv('HCAPTCHA_SECRET', 'real-secret');
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await verifyHCaptchaToken('any-token');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('network-error');
  });
});
