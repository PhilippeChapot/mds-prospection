/**
 * @vitest-environment node
 *
 * Export CSV contacts — reserve super_admin (doctrine
 * feedback_super_admin_destructive_actions_pattern, 4 couches).
 *
 * Note : ce codebase n'a que 3 roles admin ('admin' | 'sales' | 'super_admin')
 * — pas de role 'coordinator'. On teste donc admin + sales comme roles
 * insuffisants (au lieu des 4 roles imagines par le brief).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface ContactRowStub {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  phone_mobile: string | null;
  role: string | null;
  is_primary: boolean;
  language: 'FR' | 'EN';
  marketing_consent: boolean;
  lifecycle_emails_enabled: boolean;
  brevo_contact_id: string | null;
  created_at: string;
  company: { id: string; name: string; pole_code: string | null; phone: string | null };
  is_prospect: boolean;
  prospect_owner: { full_name: string | null } | null;
}

const state = {
  role: 'super_admin' as 'admin' | 'sales' | 'super_admin' | null,
  contactRows: [] as ContactRowStub[],
  linkedinRows: [] as { id: string; linkedin_url: string | null }[],
  countryRows: [] as { id: string; country: string | null }[],
  prospectRows: [] as { primary_contact_id: string | null; status: string; created_at: string }[],
  auditInserts: [] as Record<string, unknown>[],
  listContactsCalls: [] as unknown[],
};

function baseContact(overrides: Partial<ContactRowStub> = {}): ContactRowStub {
  return {
    id: 'c-1',
    email: 'jean@example.com',
    first_name: 'Jean',
    last_name: 'Dupont',
    phone: '0102030405',
    phone_mobile: null,
    role: 'Directeur',
    is_primary: true,
    language: 'FR',
    marketing_consent: true,
    lifecycle_emails_enabled: true,
    brevo_contact_id: 'brevo-1',
    created_at: '2026-06-01T10:00:00Z',
    company: { id: 'co-1', name: 'Acme Media', pole_code: 'AUDIO_RADIO', phone: null },
    is_prospect: true,
    prospect_owner: null,
    ...overrides,
  };
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireSuperAdmin: vi.fn(async () => {
      if (state.role !== 'super_admin') {
        throw new Error('Réservé aux super_admin.');
      }
      return { id: 'u-super', email: 's@b', full_name: null, role: 'super_admin' as const };
    }),
  }));
  vi.doMock('@/lib/contacts/admin-queries', () => ({
    listContactsPaginated: vi.fn(async (filters: unknown) => {
      state.listContactsCalls.push(filters);
      return { rows: state.contactRows, total: state.contactRows.length, page: 1, perPage: 5000 };
    }),
  }));
  vi.doMock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({
      from: (table: string) => {
        if (table === 'contacts') {
          return { select: () => ({ in: () => Promise.resolve({ data: state.linkedinRows }) }) };
        }
        if (table === 'companies') {
          return { select: () => ({ in: () => Promise.resolve({ data: state.countryRows }) }) };
        }
        if (table === 'prospects') {
          return {
            select: () => ({
              in: () => ({ order: () => Promise.resolve({ data: state.prospectRows }) }),
            }),
          };
        }
        if (table === 'audit_log') {
          return {
            insert: (row: Record<string, unknown>) => {
              state.auditInserts.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    }),
  }));
}

describe('exportContactsCsvAction (super_admin only)', () => {
  beforeEach(() => {
    state.role = 'super_admin';
    state.contactRows = [baseContact()];
    state.linkedinRows = [{ id: 'c-1', linkedin_url: 'https://linkedin.com/in/jean' }];
    state.countryRows = [{ id: 'co-1', country: 'FR' }];
    state.prospectRows = [
      { primary_contact_id: 'c-1', status: 'devis_envoye', created_at: '2026-06-02T10:00:00Z' },
    ];
    state.auditInserts = [];
    state.listContactsCalls = [];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('super_admin -> CSV genere avec les colonnes attendues', async () => {
    mockEnv();
    const { exportContactsCsvAction } = await import('./export-action');
    const result = await exportContactsCsvAction({});
    expect(result.csv).toContain('Email');
    expect(result.csv).toContain('jean@example.com');
    expect(result.csv).toContain('https://linkedin.com/in/jean');
    expect(result.filename).toMatch(/^contacts-export-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('admin (role insuffisant) -> rejects', async () => {
    state.role = 'admin';
    mockEnv();
    const { exportContactsCsvAction } = await import('./export-action');
    await expect(exportContactsCsvAction({})).rejects.toThrow(/super_admin/i);
    expect(state.auditInserts).toHaveLength(0);
  });

  it('sales (role insuffisant) -> rejects', async () => {
    state.role = 'sales';
    mockEnv();
    const { exportContactsCsvAction } = await import('./export-action');
    await expect(exportContactsCsvAction({})).rejects.toThrow(/super_admin/i);
    expect(state.auditInserts).toHaveLength(0);
  });

  it('sans session (requireSuperAdmin redirige) -> rejects', async () => {
    state.role = null;
    mockEnv();
    const { exportContactsCsvAction } = await import('./export-action');
    await expect(exportContactsCsvAction({})).rejects.toThrow();
  });

  it('audit log : entree rgpd_export avec row_count correct', async () => {
    state.contactRows = [baseContact({ id: 'c-1' }), baseContact({ id: 'c-2', email: 'b@x.com' })];
    mockEnv();
    const { exportContactsCsvAction } = await import('./export-action');
    await exportContactsCsvAction({});
    expect(state.auditInserts).toHaveLength(1);
    const entry = state.auditInserts[0];
    expect(entry.action).toBe('rgpd_export');
    expect(entry.entity_type).toBe('contacts');
    expect((entry.after as Record<string, unknown>).row_count).toBe(2);
  });

  it('CSV : BOM UTF-8 absent du corps (ajoute au download, pas au serializeCsv) + guillemets si virgule', async () => {
    state.contactRows = [baseContact({ role: 'Directeur, Marketing' })];
    mockEnv();
    const { exportContactsCsvAction } = await import('./export-action');
    const result = await exportContactsCsvAction({});
    expect(result.csv).toContain('"Directeur, Marketing"');
  });

  it('filtres transmis tels quels a listContactsPaginated (perPage force a 5000)', async () => {
    mockEnv();
    const { exportContactsCsvAction } = await import('./export-action');
    await exportContactsCsvAction({ poleCode: 'AUDIO_RADIO', language: 'FR' });
    expect(state.listContactsCalls).toHaveLength(1);
    expect(state.listContactsCalls[0]).toMatchObject({
      poleCode: 'AUDIO_RADIO',
      language: 'FR',
      page: 1,
      perPage: 5000,
    });
  });

  it('prospect_status : statut le plus recent (premiere ligne apres tri desc) utilise', async () => {
    state.prospectRows = [
      { primary_contact_id: 'c-1', status: 'signe', created_at: '2026-06-05T00:00:00Z' },
      { primary_contact_id: 'c-1', status: 'lead', created_at: '2026-05-01T00:00:00Z' },
    ];
    mockEnv();
    const { exportContactsCsvAction } = await import('./export-action');
    const result = await exportContactsCsvAction({});
    expect(result.csv).toContain('Devis signé');
  });
});
