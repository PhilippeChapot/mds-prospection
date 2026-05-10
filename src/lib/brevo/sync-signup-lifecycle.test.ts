/**
 * P5.x.8 — tests syncSignupLifecycle.
 *
 * On mocke getSupabaseServiceClient + upsertContactBrevo pour valider :
 *   - listIdsOverride contient VERIFIED_NOT_CONVERTED si verified+!step2+!converted
 *   - listIdsOverride vide sinon (3 cas : pas verified / step2 fait / converted)
 *   - SIGNUP_RESUME_URL bien construit FR/EN avec short_token
 *   - short_token null -> resumeUrl null
 *   - signup pas trouve -> skipped
 *   - env BREVO_LIST_ID_VERIFIED_NOT_CONVERTED absent -> skipped (warn)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_BACKUP = { ...process.env };

describe('syncSignupLifecycle (P5.x.8)', () => {
  beforeEach(() => {
    process.env.BREVO_LIST_ID_VERIFIED_NOT_CONVERTED = '500';
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.mediadays.solutions';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function mockSupabase(signupRow: Record<string, unknown> | null) {
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: signupRow, error: signupRow ? null : null }),
            }),
          }),
        }),
      }),
    }));
  }

  function mockUpsert() {
    const upsertSpy = vi.fn().mockResolvedValue({ brevoContactId: 999, listIds: [] });
    vi.doMock('./lifecycle', async () => {
      const actual = await vi.importActual<typeof import('./lifecycle')>('./lifecycle');
      return { ...actual, upsertContactBrevo: upsertSpy };
    });
    return upsertSpy;
  }

  const baseSignup = {
    id: 'sig-1',
    email: 'marie@radio.fr',
    contact_first_name: 'Marie',
    contact_last_name: 'Dupont',
    language: 'FR' as const,
    short_token: 'ABC123',
    marketing_consent: false,
    derived_category: 'standard',
  };

  it('verified + !step2 + !converted -> add to VERIFIED_NOT_CONVERTED + SIGNUP_RESUME_URL', async () => {
    mockSupabase({
      ...baseSignup,
      verified_at: '2026-05-10T10:00:00Z',
      step2_submitted_at: null,
      converted_to_prospect_id: null,
    });
    const upsertSpy = mockUpsert();

    const { syncSignupLifecycle } = await import('./sync-signup-lifecycle');
    const result = await syncSignupLifecycle('sig-1');

    expect(result.ok).toBe(true);
    expect(upsertSpy).toHaveBeenCalledOnce();
    const args = upsertSpy.mock.calls[0][0];
    expect(args.listIdsOverride).toEqual([500]);
    expect(args.signupResumeUrl).toBe(
      'https://test.mediadays.solutions/api/signup/verify?t=ABC123&loc=fr',
    );
    expect(args.email).toBe('marie@radio.fr');
    expect(args.firstName).toBe('Marie');
  });

  it('step2_submitted_at set -> listIdsOverride vide (sortie auto via unlink)', async () => {
    mockSupabase({
      ...baseSignup,
      verified_at: '2026-05-10T10:00:00Z',
      step2_submitted_at: '2026-05-10T11:00:00Z',
      converted_to_prospect_id: null,
    });
    const upsertSpy = mockUpsert();

    const { syncSignupLifecycle } = await import('./sync-signup-lifecycle');
    await syncSignupLifecycle('sig-1');

    const args = upsertSpy.mock.calls[0][0];
    expect(args.listIdsOverride).toEqual([]);
  });

  it('converted_to_prospect_id set -> listIdsOverride vide', async () => {
    mockSupabase({
      ...baseSignup,
      verified_at: '2026-05-10T10:00:00Z',
      step2_submitted_at: '2026-05-10T11:00:00Z',
      converted_to_prospect_id: 'prospect-uuid',
    });
    const upsertSpy = mockUpsert();

    const { syncSignupLifecycle } = await import('./sync-signup-lifecycle');
    await syncSignupLifecycle('sig-1');

    expect(upsertSpy.mock.calls[0][0].listIdsOverride).toEqual([]);
  });

  it('verified_at null (pas encore verifie DOI) -> listIdsOverride vide', async () => {
    mockSupabase({
      ...baseSignup,
      verified_at: null,
      step2_submitted_at: null,
      converted_to_prospect_id: null,
    });
    const upsertSpy = mockUpsert();

    const { syncSignupLifecycle } = await import('./sync-signup-lifecycle');
    await syncSignupLifecycle('sig-1');

    expect(upsertSpy.mock.calls[0][0].listIdsOverride).toEqual([]);
  });

  it('locale EN -> SIGNUP_RESUME_URL avec /api/signup/verify?...&loc=en', async () => {
    mockSupabase({
      ...baseSignup,
      language: 'EN',
      verified_at: '2026-05-10T10:00:00Z',
      step2_submitted_at: null,
      converted_to_prospect_id: null,
    });
    const upsertSpy = mockUpsert();

    const { syncSignupLifecycle } = await import('./sync-signup-lifecycle');
    await syncSignupLifecycle('sig-1');

    expect(upsertSpy.mock.calls[0][0].signupResumeUrl).toBe(
      'https://test.mediadays.solutions/api/signup/verify?t=ABC123&loc=en',
    );
  });

  it('short_token null -> SIGNUP_RESUME_URL null', async () => {
    mockSupabase({
      ...baseSignup,
      short_token: null,
      verified_at: '2026-05-10T10:00:00Z',
      step2_submitted_at: null,
      converted_to_prospect_id: null,
    });
    const upsertSpy = mockUpsert();

    const { syncSignupLifecycle } = await import('./sync-signup-lifecycle');
    await syncSignupLifecycle('sig-1');

    expect(upsertSpy.mock.calls[0][0].signupResumeUrl).toBeNull();
  });

  it("signup introuvable -> skipped:signup_not_found, pas d'upsert", async () => {
    mockSupabase(null);
    const upsertSpy = mockUpsert();

    const { syncSignupLifecycle } = await import('./sync-signup-lifecycle');
    const result = await syncSignupLifecycle('missing');

    expect(result).toEqual({ ok: false, skipped: 'signup_not_found' });
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('env VERIFIED_NOT_CONVERTED absent -> skipped:no_list_configured', async () => {
    delete process.env.BREVO_LIST_ID_VERIFIED_NOT_CONVERTED;
    mockSupabase({ ...baseSignup, verified_at: '2026-05-10T10:00:00Z' });
    const upsertSpy = mockUpsert();

    const { syncSignupLifecycle } = await import('./sync-signup-lifecycle');
    const result = await syncSignupLifecycle('sig-1');

    expect(result).toEqual({ ok: false, skipped: 'no_list_configured' });
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
