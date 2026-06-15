/**
 * @vitest-environment node
 *
 * P15.2 — tests conversions croisées (add-only).
 *
 * On isole l'orchestration : les créateurs cibles (createVisitorAction,
 * createSpeakerAction, insertProspectFromContact) sont mockés ; on vérifie
 * les reads source, les arguments passés, le former_prospect_id et l'audit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ADMIN_ID = 'aa000000-0000-4000-8000-000000000001';

const visitorCalls: unknown[] = [];
const speakerCalls: unknown[] = [];
const prospectCalls: unknown[] = [];
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const updates: Array<{ table: string; row: Record<string, unknown> }> = [];

const rows = {
  prospect: { id: 'pr-1', primary_contact_id: 'ct-1', company_id: 'co-1' } as Record<
    string,
    unknown
  > | null,
  visitor: { id: 'vi-1', contact_id: 'ct-2', company_id: 'co-2' } as Record<string, unknown> | null,
};

function reset() {
  visitorCalls.length = 0;
  speakerCalls.length = 0;
  prospectCalls.length = 0;
  inserts.length = 0;
  updates.length = 0;
  rows.prospect = { id: 'pr-1', primary_contact_id: 'ct-1', company_id: 'co-1' };
  rows.visitor = { id: 'vi-1', contact_id: 'ct-2', company_id: 'co-2' };
}

function makeBuilder(table: string) {
  let updateRow: Record<string, unknown> | null = null;
  const terminal = () => {
    if (table === 'prospects') return { data: rows.prospect, error: null };
    if (table === 'visitors') return { data: rows.visitor, error: null };
    if (table === 'companies') return { data: { pole: { code: 'AUDIO_RADIO' } }, error: null };
    if (table === 'contacts') return { data: { language: 'FR', company_id: 'co-2' }, error: null };
    return { data: null, error: null };
  };
  const builder: Record<string, unknown> = {
    select() {
      return builder;
    },
    insert(row: Record<string, unknown>) {
      inserts.push({ table, row });
      return builder;
    },
    update(row: Record<string, unknown>) {
      updateRow = row;
      return builder;
    },
    eq() {
      if (updateRow) {
        updates.push({ table, row: updateRow });
        return Promise.resolve({ error: null });
      }
      return builder;
    },
    maybeSingle: () => Promise.resolve(terminal()),
    then: (resolve: (r: { error: null }) => unknown) => Promise.resolve(resolve({ error: null })),
  };
  return builder;
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => ({
      id: ADMIN_ID,
      email: 'a@mds.fr',
      full_name: 'Admin',
      role: 'admin' as const,
    })),
    getActiveSeasonId: vi.fn(async () => 'season-1'),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({ from: (t: string) => makeBuilder(t) }),
  }));
  vi.doMock('@/lib/admin/visitors/create-actions', () => ({
    createVisitorAction: vi.fn(async (input: unknown) => {
      visitorCalls.push(input);
      return { success: true, visitor_id: 'vi-new' };
    }),
  }));
  vi.doMock('@/lib/admin/speakers/create-actions', () => ({
    createSpeakerAction: vi.fn(async (input: unknown) => {
      speakerCalls.push(input);
      return { success: true, speaker_id: 'sp-new' };
    }),
  }));
  vi.doMock('@/lib/admin/prospects/create-core', () => ({
    insertProspectFromContact: vi.fn(async (input: unknown) => {
      prospectCalls.push(input);
      return { prospect_id: 'pr-new' };
    }),
  }));
}

async function load() {
  mockEnv();
  return import('./cross-conversion-actions');
}

beforeEach(() => {
  vi.resetModules();
  reset();
});

describe('cross conversions (P15.2)', () => {
  it('prospect → visitor : crée visiteur (source converted_from_prospect), lie former_prospect_id, audit', async () => {
    const { convertProspectToVisitorAction } = await load();
    const res = await convertProspectToVisitorAction({ prospect_id: 'pr-1' });
    expect(res.visitor_id).toBe('vi-new');
    expect(visitorCalls[0]).toMatchObject({
      contact_id: 'ct-1',
      source: 'converted_from_prospect',
      pole: 'AUDIO_RADIO',
      language: 'fr',
    });
    // former_prospect_id lié sur la row visiteur créée
    const upd = updates.find((u) => u.table === 'visitors');
    expect(upd?.row.former_prospect_id).toBe('pr-1');
    // audit sur l'entité source (prospect)
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect(audit?.row.entity_type).toBe('prospects');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe(
      'prospect_converted_to_visitor',
    );
  });

  it('visitor → prospect : insertProspectFromContact avec company fallback + audit', async () => {
    const { convertVisitorToProspectAction } = await load();
    const res = await convertVisitorToProspectAction({ visitor_id: 'vi-1' });
    expect(res.prospect_id).toBe('pr-new');
    expect(prospectCalls[0]).toMatchObject({
      contactId: 'ct-2',
      companyId: 'co-2',
      ownerId: ADMIN_ID,
    });
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect(audit?.row.entity_type).toBe('visitors');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe(
      'visitor_converted_to_prospect',
    );
  });

  it('prospect → speaker : crée speaker + audit', async () => {
    const { convertProspectToSpeakerAction } = await load();
    const res = await convertProspectToSpeakerAction({ prospect_id: 'pr-1' });
    expect(res.speaker_id).toBe('sp-new');
    expect(speakerCalls[0]).toMatchObject({ contact_id: 'ct-1' });
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe(
      'prospect_converted_to_speaker',
    );
  });
});
