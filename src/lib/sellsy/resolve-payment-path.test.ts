/**
 * P4.x.3 Bug K — tests resolvePaymentPath.
 *
 * Cas couverts :
 *   - Colonne SQL peuplee -> on retourne direct sans fallback DB
 *   - Colonne SQL null mais step2_payload.paymentPath set -> fallback OK
 *   - Colonne SQL null + step2_payload.paymentPath null -> retourne null
 *   - Colonne SQL null + step2_payload.paymentPath valeur invalide ->
 *     retourne null (sanity guard)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('resolvePaymentPath (P4.x.3 Bug K)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('colonne SQL peuplee : retourne direct sans lookup DB', async () => {
    // Si la colonne est set, on n'a pas besoin de toucher Supabase.
    // Un mock minimal de getSupabaseServiceClient suffirait — mais ici
    // on ne devrait meme pas l'appeler.
    const mockClient = {
      from: vi.fn(() => {
        throw new Error('should not be called when column is set');
      }),
    };
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => mockClient,
    }));
    const { resolvePaymentPath } = await import('./post-conversion');
    const result = await resolvePaymentPath('prospect-1', 'devis_acompte_stripe');
    expect(result).toBe('devis_acompte_stripe');
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it('colonne null + step2.paymentPath=devis_acompte_stripe : fallback OK', async () => {
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: vi.fn(() => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { step2_payload: { paymentPath: 'devis_acompte_stripe' } },
                }),
            }),
          }),
        })),
      }),
    }));
    const { resolvePaymentPath } = await import('./post-conversion');
    const result = await resolvePaymentPath('prospect-1', null);
    expect(result).toBe('devis_acompte_stripe');
  });

  it('colonne null + step2.paymentPath=devis_sepa : fallback OK', async () => {
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: vi.fn(() => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { step2_payload: { paymentPath: 'devis_sepa' } },
                }),
            }),
          }),
        })),
      }),
    }));
    const { resolvePaymentPath } = await import('./post-conversion');
    const result = await resolvePaymentPath('prospect-1', null);
    expect(result).toBe('devis_sepa');
  });

  it('colonne null + pas de signup associe : retourne null', async () => {
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: vi.fn(() => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null }),
            }),
          }),
        })),
      }),
    }));
    const { resolvePaymentPath } = await import('./post-conversion');
    const result = await resolvePaymentPath('prospect-1', null);
    expect(result).toBeNull();
  });

  it('colonne null + step2.paymentPath valeur invalide : retourne null', async () => {
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: vi.fn(() => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { step2_payload: { paymentPath: 'mauvaise_valeur' } },
                }),
            }),
          }),
        })),
      }),
    }));
    const { resolvePaymentPath } = await import('./post-conversion');
    const result = await resolvePaymentPath('prospect-1', null);
    expect(result).toBeNull();
  });

  it('colonne null + step2 sans paymentPath (cas B manifestation) : retourne null', async () => {
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: vi.fn(() => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { step2_payload: { mode: 'caseB', presenceType: 'visiteur' } },
                }),
            }),
          }),
        })),
      }),
    }));
    const { resolvePaymentPath } = await import('./post-conversion');
    const result = await resolvePaymentPath('prospect-1', null);
    expect(result).toBeNull();
  });
});
