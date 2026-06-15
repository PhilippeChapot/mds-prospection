/**
 * @vitest-environment node
 *
 * P14.1.SalesCalendarCore — tests server actions CRUD.
 *
 * Couvre :
 *   - create : OK simple
 *   - create : detect overlap → ok:false + errorCode='overlap'
 *   - create : force_overlap par sales → super_admin_required
 *   - create : super_admin force_overlap → OK
 *   - create : target_user_id par admin non super → forbidden
 *   - update : RBAC (only owner ou super_admin)
 *   - markDone : set status + outcome
 *   - markDone : reject si deja done
 *   - delete : RBAC
 *   - list : filtre par range + RBAC voir autre user
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type StoredEvent = {
  id: string;
  user_id: string;
  prospect_id: string | null;
  event_type: 'call_relance' | 'meeting' | 'task';
  status: 'pending' | 'done' | 'cancelled' | 'missed';
  priority: 'low' | 'normal' | 'high';
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean;
  duration_minutes: number | null;
  outcome: string | null;
  reminder_15min_sent_at: string | null;
  reminder_1h_sent_at: string | null;
  reminder_24h_sent_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_user_id: string | null;
  google_calendar_event_id: string | null;
  google_calendar_synced_at: string | null;
};

const state = {
  profile: {
    id: 'u-self',
    email: 's@b',
    full_name: null as string | null,
    role: 'sales' as 'admin' | 'sales' | 'super_admin',
  },
  events: [] as StoredEvent[],
  audits: [] as Record<string, unknown>[],
  insertError: null as { code: string; message: string } | null,
};

function makeChain(table: string) {
  const filters: Array<{ op: string; col?: string; val?: unknown; valArr?: unknown }> = [];
  let pendingPatch: Record<string, unknown> | null = null;
  let pendingInsert: Record<string, unknown> | null = null;
  let pendingDelete = false;

  function applyFilters(rows: StoredEvent[]): StoredEvent[] {
    return rows.filter((r) => {
      for (const f of filters) {
        const v = (r as unknown as Record<string, unknown>)[f.col ?? ''];
        if (f.op === 'eq' && v !== f.val) return false;
        if (f.op === 'neq' && v === f.val) return false;
        if (f.op === 'gte' && !(typeof v === 'string' && v >= String(f.val))) return false;
        if (f.op === 'lte' && !(typeof v === 'string' && v <= String(f.val))) return false;
        if (f.op === 'lt' && !(typeof v === 'string' && v < String(f.val))) return false;
        if (f.op === 'gt' && !(typeof v === 'string' && v > String(f.val))) return false;
        if (f.op === 'not_null' && v === null) return false;
        if (f.op === 'not_in') {
          const arr = f.valArr as unknown[];
          if (arr.includes(v)) return false;
        }
        if (f.op === 'or_str') {
          // Handle "user_id.eq.UUID,assignee_user_ids.cs.{UUID}" (P14.5).
          const str = String(f.val);
          const eqMatch = str.match(/user_id\.eq\.([^,]+)/);
          const targetId = eqMatch?.[1];
          if (targetId) {
            const rec = r as unknown as Record<string, unknown>;
            const ownerId = rec['user_id'];
            const assignees = (rec['assignee_user_ids'] as string[] | undefined) ?? [];
            if (ownerId !== targetId && !assignees.includes(targetId)) return false;
          }
        }
      }
      return true;
    });
  }

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push({ op: 'eq', col, val });
      return chain;
    },
    neq: (col: string, val: unknown) => {
      filters.push({ op: 'neq', col, val });
      return chain;
    },
    gte: (col: string, val: unknown) => {
      filters.push({ op: 'gte', col, val });
      return chain;
    },
    lte: (col: string, val: unknown) => {
      filters.push({ op: 'lte', col, val });
      return chain;
    },
    lt: (col: string, val: unknown) => {
      filters.push({ op: 'lt', col, val });
      return chain;
    },
    gt: (col: string, val: unknown) => {
      filters.push({ op: 'gt', col, val });
      return chain;
    },
    not: (col: string, op: string, val?: unknown) => {
      if (op === 'is') {
        filters.push({ op: 'not_null', col });
      } else if (op === 'in') {
        // val is string like "(cancelled,done)" → parse.
        const arr = String(val)
          .replace(/^\(|\)$/g, '')
          .split(',')
          .map((s) => s.trim());
        filters.push({ op: 'not_in', col, valArr: arr });
      }
      return chain;
    },
    or: (filterStr: string) => {
      // Parse "user_id.eq.UUID,assignee_user_ids.cs.{UUID}" for P14.5 list.
      filters.push({ op: 'or_str', val: filterStr });
      return chain;
    },
    order: () => chain,
    limit: () => Promise.resolve({ data: applyFilters(state.events).slice(0, 1), error: null }),
    maybeSingle: () => {
      const matches = applyFilters(state.events);
      return Promise.resolve({ data: matches[0] ?? null, error: null });
    },
    single: () => {
      if (pendingInsert) {
        if (state.insertError) {
          return Promise.resolve({ data: null, error: state.insertError });
        }
        const id = `gen-${state.events.length}`;
        const row = { ...pendingInsert, id } as StoredEvent;
        // Hydrate defaults manquants.
        row.created_at = row.created_at ?? new Date().toISOString();
        row.updated_at = row.updated_at ?? new Date().toISOString();
        row.status = row.status ?? 'pending';
        row.priority = row.priority ?? 'normal';
        row.is_all_day = row.is_all_day ?? false;
        row.duration_minutes =
          row.end_at && row.start_at
            ? Math.floor(
                (new Date(row.end_at).getTime() - new Date(row.start_at).getTime()) / 60000,
              )
            : null;
        row.outcome = row.outcome ?? null;
        row.reminder_15min_sent_at = row.reminder_15min_sent_at ?? null;
        row.reminder_1h_sent_at = row.reminder_1h_sent_at ?? null;
        row.reminder_24h_sent_at = row.reminder_24h_sent_at ?? null;
        row.google_calendar_event_id = row.google_calendar_event_id ?? null;
        row.google_calendar_synced_at = row.google_calendar_synced_at ?? null;
        row.description = row.description ?? null;
        row.location = row.location ?? null;
        state.events.push(row);
        return Promise.resolve({ data: row, error: null });
      }
      if (pendingPatch) {
        const matches = applyFilters(state.events);
        const target = matches[0];
        if (target) Object.assign(target, pendingPatch);
        return Promise.resolve({ data: target ?? null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (row: Record<string, unknown>) => {
      if (table === 'audit_log') {
        state.audits.push(row);
        return Promise.resolve({ error: null });
      }
      pendingInsert = row;
      return chain;
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    delete: () => {
      pendingDelete = true;
      return chain;
    },
    then: (cb: (v: { error: null; data?: unknown }) => unknown) => {
      if (pendingDelete) {
        const matches = applyFilters(state.events);
        for (const m of matches) {
          state.events = state.events.filter((e) => e.id !== m.id);
        }
        return Promise.resolve({ error: null }).then(cb);
      }
      if (pendingPatch) {
        const matches = applyFilters(state.events);
        for (const m of matches) Object.assign(m, pendingPatch);
        return Promise.resolve({ error: null }).then(cb);
      }
      // Mode SELECT : retourner les rows filtrees comme data.
      return Promise.resolve({ data: applyFilters(state.events), error: null }).then(cb);
    },
  };
  return chain;
}

function mockEnv() {
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => state.profile),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({ from: (t: string) => makeChain(t) }),
  }));
}

function resetState() {
  state.profile = { id: 'u-self', email: 's@b', full_name: null, role: 'sales' };
  state.events = [];
  state.audits = [];
  state.insertError = null;
}

const NOW = '2026-06-07T10:00:00.000Z';
const PLUS30 = '2026-06-07T10:30:00.000Z';
const PLUS60 = '2026-06-07T11:00:00.000Z';

describe('createCalendarEventAction (P14.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('OK creation simple meeting + audit log', async () => {
    mockEnv();
    const { createCalendarEventAction } = await import('./actions');
    const r = await createCalendarEventAction({
      event_type: 'meeting',
      title: 'Demo Acme',
      start_at: NOW,
      end_at: PLUS30,
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.event) {
      expect(r.event.user_id).toBe('u-self');
      expect(r.event.event_type).toBe('meeting');
    }
    expect((state.audits[0]?.after as Record<string, unknown>).kind).toBe('calendar_event_created');
  });

  it('Overlap detecte → ok:false + errorCode=overlap', async () => {
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0004',
      user_id: 'u-self',
      prospect_id: null,
      event_type: 'meeting',
      status: 'pending',
      priority: 'normal',
      title: 'Existing call',
      description: null,
      location: null,
      start_at: NOW,
      end_at: PLUS60,
      is_all_day: false,
      duration_minutes: 60,
      outcome: null,
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-self',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    mockEnv();
    const { createCalendarEventAction } = await import('./actions');
    const r = await createCalendarEventAction({
      event_type: 'meeting',
      title: 'Conflict',
      start_at: '2026-06-07T10:15:00.000Z',
      end_at: '2026-06-07T10:45:00.000Z',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe('overlap');
      expect(r.conflictEvent?.title).toBe('Existing call');
    }
  });

  it('force_overlap par sales → super_admin_required', async () => {
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0004',
      user_id: 'u-self',
      prospect_id: null,
      event_type: 'meeting',
      status: 'pending',
      priority: 'normal',
      title: 'Existing',
      description: null,
      location: null,
      start_at: NOW,
      end_at: PLUS30,
      is_all_day: false,
      duration_minutes: 30,
      outcome: null,
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-self',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    mockEnv();
    const { createCalendarEventAction } = await import('./actions');
    const r = await createCalendarEventAction({
      event_type: 'meeting',
      title: 'Forced',
      start_at: NOW,
      end_at: PLUS30,
      force_overlap: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe('super_admin_required');
  });

  it('Super_admin force_overlap → OK', async () => {
    state.profile.role = 'super_admin';
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0004',
      user_id: 'u-self',
      prospect_id: null,
      event_type: 'meeting',
      status: 'pending',
      priority: 'normal',
      title: 'Existing',
      description: null,
      location: null,
      start_at: NOW,
      end_at: PLUS30,
      is_all_day: false,
      duration_minutes: 30,
      outcome: null,
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-self',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    mockEnv();
    const { createCalendarEventAction } = await import('./actions');
    const r = await createCalendarEventAction({
      event_type: 'meeting',
      title: 'Forced',
      start_at: NOW,
      end_at: PLUS30,
      force_overlap: true,
    });
    expect(r.ok).toBe(true);
    expect((state.audits[0]?.after as Record<string, unknown>).forced_overlap).toBe(true);
  });

  it('target_user_id par admin non super → forbidden', async () => {
    state.profile.role = 'admin';
    mockEnv();
    const { createCalendarEventAction } = await import('./actions');
    const r = await createCalendarEventAction({
      event_type: 'task',
      title: 'For another',
      start_at: NOW,
      target_user_id: '00000000-0000-4000-8000-000000000001',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe('forbidden');
  });

  it('Task sans end_at OK + pas de check overlap', async () => {
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0004',
      user_id: 'u-self',
      prospect_id: null,
      event_type: 'meeting',
      status: 'pending',
      priority: 'normal',
      title: 'Whatever',
      description: null,
      location: null,
      start_at: NOW,
      end_at: PLUS60,
      is_all_day: false,
      duration_minutes: 60,
      outcome: null,
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-self',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    mockEnv();
    const { createCalendarEventAction } = await import('./actions');
    const r = await createCalendarEventAction({
      event_type: 'task',
      title: 'Todo sans heure',
      start_at: NOW,
    });
    expect(r.ok).toBe(true);
  });

  it('DB EXCLUDE constraint 23P01 → remap en overlap (race condition)', async () => {
    state.insertError = { code: '23P01', message: 'exclusion conflict' };
    mockEnv();
    const { createCalendarEventAction } = await import('./actions');
    const r = await createCalendarEventAction({
      event_type: 'meeting',
      title: 'Race',
      start_at: NOW,
      end_at: PLUS30,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe('overlap');
  });

  it('DB CHECK constraint 23514 end_after_start → errorCode=end_after_start', async () => {
    // P14.1.HOTFIX-UX : si la validation client + Zod laissait passer un
    // end <= start (rare), la DB rejette via check constraint. Le server
    // action doit remapper vers un message friendly plutot que le brut PG.
    state.insertError = {
      code: '23514',
      message:
        'new row for relation "calendar_events" violates check constraint "calendar_events_end_after_start"',
    };
    mockEnv();
    const { createCalendarEventAction } = await import('./actions');
    const r = await createCalendarEventAction({
      event_type: 'meeting',
      title: 'Bad range',
      start_at: NOW,
      end_at: PLUS30, // valide cote Zod, mais la DB rejette en simu
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe('end_after_start');
      expect(r.error).toMatch(/fin.*apres.*debut/i);
    }
  });
});

describe('markCalendarEventDoneAction (P14.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Set status=done + outcome + audit log', async () => {
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
      user_id: 'u-self',
      prospect_id: 'p-1',
      event_type: 'call_relance',
      status: 'pending',
      priority: 'normal',
      title: 'Relance',
      description: null,
      location: null,
      start_at: NOW,
      end_at: PLUS30,
      is_all_day: false,
      duration_minutes: 30,
      outcome: null,
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-self',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    mockEnv();
    const { markCalendarEventDoneAction } = await import('./actions');
    const r = await markCalendarEventDoneAction({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
      outcome: 'demo_booked',
    });
    expect(r.ok).toBe(true);
    expect(state.events[0].status).toBe('done');
    expect(state.events[0].outcome).toBe('demo_booked');
    expect((state.audits[0]?.after as Record<string, unknown>).kind).toBe(
      'calendar_event_marked_done',
    );
  });

  it('Reject si deja done', async () => {
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002',
      user_id: 'u-self',
      prospect_id: null,
      event_type: 'meeting',
      status: 'done',
      priority: 'normal',
      title: 'Done',
      description: null,
      location: null,
      start_at: NOW,
      end_at: PLUS30,
      is_all_day: false,
      duration_minutes: 30,
      outcome: 'demo_booked',
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-self',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    mockEnv();
    const { markCalendarEventDoneAction } = await import('./actions');
    const r = await markCalendarEventDoneAction({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe('validation');
  });

  it('Reject si pas owner (sales tente de marker event d un autre)', async () => {
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003',
      user_id: 'u-other',
      prospect_id: null,
      event_type: 'call_relance',
      status: 'pending',
      priority: 'normal',
      title: 'Other',
      description: null,
      location: null,
      start_at: NOW,
      end_at: PLUS30,
      is_all_day: false,
      duration_minutes: 30,
      outcome: null,
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-other',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    mockEnv();
    const { markCalendarEventDoneAction } = await import('./actions');
    const r = await markCalendarEventDoneAction({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe('forbidden');
  });
});

describe('deleteCalendarEventAction (P14.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Delete OK pour owner', async () => {
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1001',
      user_id: 'u-self',
      prospect_id: null,
      event_type: 'task',
      status: 'pending',
      priority: 'normal',
      title: 'Todo',
      description: null,
      location: null,
      start_at: NOW,
      end_at: null,
      is_all_day: false,
      duration_minutes: null,
      outcome: null,
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-self',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    mockEnv();
    const { deleteCalendarEventAction } = await import('./actions');
    const r = await deleteCalendarEventAction({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1001' });
    expect(r.ok).toBe(true);
    expect(state.events).toHaveLength(0);
  });

  it('Reject si pas owner', async () => {
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1002',
      user_id: 'u-other',
      prospect_id: null,
      event_type: 'task',
      status: 'pending',
      priority: 'normal',
      title: 'Todo',
      description: null,
      location: null,
      start_at: NOW,
      end_at: null,
      is_all_day: false,
      duration_minutes: null,
      outcome: null,
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-other',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    mockEnv();
    const { deleteCalendarEventAction } = await import('./actions');
    const r = await deleteCalendarEventAction({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1002' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe('forbidden');
    expect(state.events).toHaveLength(1); // pas supprime
  });
});

describe('updateCalendarEventAction (P14.2)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Met à jour un event status=done sans blocage → ok:true', async () => {
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa2001',
      user_id: 'u-self',
      prospect_id: 'p-1',
      event_type: 'call_relance',
      status: 'done',
      priority: 'normal',
      title: 'Relance faite',
      description: null,
      location: null,
      start_at: NOW,
      end_at: PLUS30,
      is_all_day: false,
      duration_minutes: 30,
      outcome: 'demo_booked',
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-self',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    mockEnv();
    const { updateCalendarEventAction } = await import('./actions');
    const r = await updateCalendarEventAction({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa2001',
      title: 'Relance faite (corrigé)',
    });
    expect(r.ok).toBe(true);
    expect(state.events[0].title).toBe('Relance faite (corrigé)');
  });

  it('Reject update si pas owner (status=pending)', async () => {
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa2002',
      user_id: 'u-other',
      prospect_id: null,
      event_type: 'meeting',
      status: 'pending',
      priority: 'normal',
      title: 'RDV autre',
      description: null,
      location: null,
      start_at: NOW,
      end_at: PLUS30,
      is_all_day: false,
      duration_minutes: 30,
      outcome: null,
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-other',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    mockEnv();
    const { updateCalendarEventAction } = await import('./actions');
    const r = await updateCalendarEventAction({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa2002',
      title: 'Tenter de modifier',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe('forbidden');
  });
});

describe('listCalendarEventsAction (P14.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Filtre par range start_at', async () => {
    const week = ['2026-06-08T09:00:00.000Z', '2026-06-09T09:00:00.000Z'];
    state.events.push(
      ...week.map((t, i) => ({
        id: `e-${i}`,
        user_id: 'u-self',
        prospect_id: null,
        event_type: 'task' as const,
        status: 'pending' as const,
        priority: 'normal' as const,
        title: 'T',
        description: null,
        location: null,
        start_at: t,
        end_at: null,
        is_all_day: false,
        duration_minutes: null,
        outcome: null,
        reminder_15min_sent_at: null,
        reminder_1h_sent_at: null,
        reminder_24h_sent_at: null,
        created_at: t,
        updated_at: t,
        created_by_user_id: 'u-self',
        google_calendar_event_id: null,
        google_calendar_synced_at: null,
      })),
    );
    mockEnv();
    const { listCalendarEventsAction } = await import('./actions');
    const r = await listCalendarEventsAction({
      start_range: '2026-06-08T00:00:00.000Z',
      end_range: '2026-06-08T23:59:59.000Z',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.events).toHaveLength(1);
  });

  it('Sales filter user_id d un autre → forbidden', async () => {
    mockEnv();
    const { listCalendarEventsAction } = await import('./actions');
    const r = await listCalendarEventsAction({
      start_range: '2026-06-07T00:00:00.000Z',
      end_range: '2026-06-07T23:59:59.000Z',
      user_id: '00000000-0000-4000-8000-000000000099',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe('forbidden');
  });

  it('Super_admin sans user_id → tous les events', async () => {
    state.profile.role = 'super_admin';
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005',
      user_id: 'u-A',
      prospect_id: null,
      event_type: 'task',
      status: 'pending',
      priority: 'normal',
      title: 'A',
      description: null,
      location: null,
      start_at: NOW,
      end_at: null,
      is_all_day: false,
      duration_minutes: null,
      outcome: null,
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-A',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    state.events.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0006',
      user_id: 'u-B',
      prospect_id: null,
      event_type: 'task',
      status: 'pending',
      priority: 'normal',
      title: 'B',
      description: null,
      location: null,
      start_at: NOW,
      end_at: null,
      is_all_day: false,
      duration_minutes: null,
      outcome: null,
      reminder_15min_sent_at: null,
      reminder_1h_sent_at: null,
      reminder_24h_sent_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by_user_id: 'u-B',
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
    });
    mockEnv();
    const { listCalendarEventsAction } = await import('./actions');
    const r = await listCalendarEventsAction({
      start_range: '2026-06-07T00:00:00.000Z',
      end_range: '2026-06-07T23:59:59.000Z',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.events?.length).toBe(2);
  });
});
