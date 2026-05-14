/**
 * P5.x.23-ter — test parseSmartAddInput retourne existingContacts.
 *
 * On mocke :
 *   - parseInputWithAI (résultat synthétique avec email)
 *   - getSupabaseServiceClient (contacts table → 1 match par email ilike)
 *   - INSEE (no-op, on retourne null)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_BACKUP = { ...process.env };

function mockOrchestratorDeps(opts: { existingContactRow?: Record<string, unknown> | null }) {
  // Mock parse-with-ai → résultat synthétique avec email
  vi.doMock('./parse-with-ai', () => ({
    parseInputWithAI: vi.fn().mockResolvedValue({
      person: {
        first_name: 'Alice',
        last_name: null,
        email: 'alice@acme.com',
        phone: null,
        role: null,
        linkedin_url: null,
      },
      company: {
        name: 'Acme',
        website: null,
        country: 'US',
        primary_domain: 'acme.com',
        alternate_domains: [],
        description: null,
        suggested_pole: 'INCONNU',
      },
      confidence: 'medium',
      notes: null,
      modelUsed: 'mock',
      tokensIn: 0,
      tokensOut: 0,
    }),
  }));

  // Mock INSEE → on s'en moque (pays != FR donc pas appelé)
  vi.doMock('@/lib/insee/sirene', () => ({
    autoMatchSiren: vi.fn().mockResolvedValue(null),
  }));

  // Mock Supabase : companies fuzzy → []; contacts ilike → opts.existingContactRow
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => ({
        select: () => ({
          // companies fuzzy
          or: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          // contacts dedup
          ilike: () => ({
            limit: () =>
              Promise.resolve({
                data:
                  table === 'contacts' && opts.existingContactRow ? [opts.existingContactRow] : [],
                error: null,
              }),
          }),
        }),
      }),
    }),
  }));
}

describe('parseSmartAddInput existingContacts (P5.x.23-ter)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.INSEE_API_KEY = 'test';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    if (!ENV_BACKUP.ANTHROPIC_API_KEY) delete process.env.ANTHROPIC_API_KEY;
    if (!ENV_BACKUP.INSEE_API_KEY) delete process.env.INSEE_API_KEY;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns existingContacts when an email matches a contact in DB', async () => {
    mockOrchestratorDeps({
      existingContactRow: {
        id: 'c1',
        email: 'alice@acme.com',
        first_name: 'Alice',
        last_name: 'A',
        phone: '+331',
        role: 'CEO',
        is_primary: true,
        language: 'FR',
        company_id: 'co1',
        company: { name: 'Acme Inc' },
      },
    });

    const { parseSmartAddInput } = await import('./orchestrator');
    const result = await parseSmartAddInput('some text');
    expect(result.existingContacts).toHaveLength(1);
    expect(result.existingContacts[0]?.email).toBe('alice@acme.com');
    expect(result.existingContacts[0]?.company_name).toBe('Acme Inc');
  });

  it('returns empty existingContacts when no email match', async () => {
    mockOrchestratorDeps({ existingContactRow: null });

    const { parseSmartAddInput } = await import('./orchestrator');
    const result = await parseSmartAddInput('some text');
    expect(result.existingContacts).toEqual([]);
  });
});
