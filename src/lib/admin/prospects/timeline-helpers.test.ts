/**
 * @vitest-environment node
 *
 * P14.3.ProspectTimelineDrawer — tests helpers backend timeline.
 *
 * On mock le service client Supabase pour isoler la logique
 * hydratation (users + contacts) sans dependance DB locale.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Row = Record<string, unknown>;

const state = {
  viewRows: [] as Row[],
  users: [] as Row[],
  contacts: [] as Row[],
  prospect: null as Row | null,
  contactBelongs: null as Row | null,
};

function mockService() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from(table: string) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: () => {
            if (table === 'prospects') return Promise.resolve({ data: state.prospect });
            if (table === 'contacts') return Promise.resolve({ data: state.contactBelongs });
            return Promise.resolve({ data: null });
          },
          then: (fn: (v: { data: Row[]; error: null }) => unknown) => {
            if (table === 'prospect_timeline_view')
              return Promise.resolve({ data: state.viewRows, error: null }).then(fn);
            if (table === 'users')
              return Promise.resolve({ data: state.users, error: null }).then(fn);
            if (table === 'contacts')
              return Promise.resolve({ data: state.contacts, error: null }).then(fn);
            return Promise.resolve({ data: [], error: null }).then(fn);
          },
        };
        return chain;
      },
    }),
  }));
}

function reset() {
  state.viewRows = [];
  state.users = [];
  state.contacts = [];
  state.prospect = null;
  state.contactBelongs = null;
}

describe('getProspectTimeline (P14.3)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('prospectId vide → retourne []', async () => {
    mockService();
    const { getProspectTimeline } = await import('./timeline-helpers');
    const r = await getProspectTimeline('');
    expect(r).toEqual([]);
  });

  it('Hydrate actor et contact via lookups bulk', async () => {
    state.viewRows = [
      {
        id: 'n1',
        prospect_id: 'p1',
        entry_type: 'note',
        event_at: '2026-06-08T10:00:00.000Z',
        actor_user_id: 'u1',
        contact_id: 'c1',
        content: 'Premier contact',
        calendar_event_type: null,
        calendar_event_status: null,
        calendar_event_start: null,
        calendar_event_end: null,
        meet_url: null,
        meet_conference_id: null,
        attendees: null,
      },
    ];
    state.users = [{ id: 'u1', full_name: 'Phil Chapot', email: 'phil@mds.fr' }];
    state.contacts = [{ id: 'c1', first_name: 'Lucie', last_name: 'Chollet', email: 'lc@x.fr' }];
    mockService();
    const { getProspectTimeline } = await import('./timeline-helpers');
    const r = await getProspectTimeline('p1');
    expect(r).toHaveLength(1);
    expect(r[0].actor?.full_name).toBe('Phil Chapot');
    expect(r[0].contact?.full_name).toBe('Lucie Chollet');
    expect(r[0].entry_type).toBe('note');
  });

  it('Pas d actor → entry.actor = null', async () => {
    state.viewRows = [
      {
        id: 'n2',
        prospect_id: 'p1',
        entry_type: 'note',
        event_at: '2026-06-08T10:00:00.000Z',
        actor_user_id: null,
        contact_id: null,
        content: 'Note systeme',
        calendar_event_type: null,
        calendar_event_status: null,
        calendar_event_start: null,
        calendar_event_end: null,
        meet_url: null,
        meet_conference_id: null,
        attendees: null,
      },
    ];
    mockService();
    const { getProspectTimeline } = await import('./timeline-helpers');
    const r = await getProspectTimeline('p1');
    expect(r[0].actor).toBeNull();
    expect(r[0].contact).toBeNull();
  });

  it('Contact sans nom → fallback email', async () => {
    state.viewRows = [
      {
        id: 'n3',
        prospect_id: 'p1',
        entry_type: 'note',
        event_at: '2026-06-08T10:00:00.000Z',
        actor_user_id: null,
        contact_id: 'c2',
        content: 'x',
        calendar_event_type: null,
        calendar_event_status: null,
        calendar_event_start: null,
        calendar_event_end: null,
        meet_url: null,
        meet_conference_id: null,
        attendees: null,
      },
    ];
    state.contacts = [{ id: 'c2', first_name: null, last_name: null, email: 'no@name.fr' }];
    mockService();
    const { getProspectTimeline } = await import('./timeline-helpers');
    const r = await getProspectTimeline('p1');
    expect(r[0].contact?.full_name).toBe('no@name.fr');
  });

  it('Calendar event entry passe les meta type/status/start', async () => {
    state.viewRows = [
      {
        id: 'ce1',
        prospect_id: 'p1',
        entry_type: 'calendar_event',
        event_at: '2026-06-10T09:00:00.000Z',
        actor_user_id: 'u1',
        contact_id: null,
        content: 'Relance Lucie — call 30 min',
        calendar_event_type: 'call_relance',
        calendar_event_status: 'pending',
        calendar_event_start: '2026-06-10T09:00:00.000Z',
        calendar_event_end: '2026-06-10T09:30:00.000Z',
        meet_url: null,
        meet_conference_id: null,
        attendees: null,
      },
    ];
    state.users = [{ id: 'u1', full_name: 'Phil', email: 'p@mds.fr' }];
    mockService();
    const { getProspectTimeline } = await import('./timeline-helpers');
    const r = await getProspectTimeline('p1');
    expect(r[0].entry_type).toBe('calendar_event');
    expect(r[0].calendar_event_type).toBe('call_relance');
    expect(r[0].calendar_event_status).toBe('pending');
    expect(r[0].calendar_event_start).toBe('2026-06-10T09:00:00.000Z');
  });

  it('P14.2 #8/#9 — calendar event avec meet_url + attendees propagés dans TimelineEntry', async () => {
    state.viewRows = [
      {
        id: 'ce2',
        prospect_id: 'p1',
        entry_type: 'calendar_event',
        event_at: '2026-06-15T14:00:00.000Z',
        actor_user_id: 'u1',
        contact_id: null,
        content: 'Meeting avec Meet',
        calendar_event_type: 'meeting',
        calendar_event_status: 'pending',
        calendar_event_start: '2026-06-15T14:00:00.000Z',
        calendar_event_end: '2026-06-15T15:00:00.000Z',
        meet_url: 'https://meet.google.com/abc-xyz',
        meet_conference_id: 'conf-99',
        attendees: [
          {
            email: 'alice@acme.com',
            displayName: 'Alice',
            responseStatus: 'accepted',
            contact_id: 'c-1',
          },
          {
            email: 'bob@acme.com',
            displayName: 'Bob',
            responseStatus: 'needsAction',
            contact_id: null,
          },
        ],
      },
    ];
    state.users = [{ id: 'u1', full_name: 'Phil', email: 'p@mds.fr' }];
    mockService();
    const { getProspectTimeline } = await import('./timeline-helpers');
    const r = await getProspectTimeline('p1');
    expect(r).toHaveLength(1);
    const entry = r[0];
    // meet_url exposé dans TimelineEntry.
    expect(entry.meet_url).toBe('https://meet.google.com/abc-xyz');
    // attendees exposés avec responseStatus.
    expect(entry.attendees).toHaveLength(2);
    expect(entry.attendees![0].email).toBe('alice@acme.com');
    expect(entry.attendees![0].responseStatus).toBe('accepted');
    expect(entry.attendees![0].contact_id).toBe('c-1');
    expect(entry.attendees![1].email).toBe('bob@acme.com');
  });
});

describe('getProspectContacts (P14.3)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('Prospect sans company → retourne []', async () => {
    state.prospect = null;
    mockService();
    const { getProspectContacts } = await import('./timeline-helpers');
    const r = await getProspectContacts('p1');
    expect(r).toEqual([]);
  });

  it('Contacts map vers full_name + role', async () => {
    state.prospect = { company_id: 'co1' };
    state.contacts = [
      {
        id: 'c1',
        first_name: 'Lucie',
        last_name: 'Chollet',
        email: 'lc@x.fr',
        role: 'Directrice',
      },
    ];
    mockService();
    const { getProspectContacts } = await import('./timeline-helpers');
    const r = await getProspectContacts('p1');
    expect(r).toHaveLength(1);
    expect(r[0].full_name).toBe('Lucie Chollet');
    expect(r[0].role).toBe('Directrice');
  });
});

describe('validateContactBelongsToProspect (P14.3)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('Prospect sans company → false', async () => {
    state.prospect = null;
    mockService();
    const { validateContactBelongsToProspect } = await import('./timeline-helpers');
    expect(await validateContactBelongsToProspect('c1', 'p1')).toBe(false);
  });

  it('Contact appartient bien a la company → true', async () => {
    state.prospect = { company_id: 'co1' };
    state.contactBelongs = { id: 'c1' };
    mockService();
    const { validateContactBelongsToProspect } = await import('./timeline-helpers');
    expect(await validateContactBelongsToProspect('c1', 'p1')).toBe(true);
  });

  it('Contact d une AUTRE company → false', async () => {
    state.prospect = { company_id: 'co1' };
    state.contactBelongs = null; // .eq company_id='co1' ne match pas
    mockService();
    const { validateContactBelongsToProspect } = await import('./timeline-helpers');
    expect(await validateContactBelongsToProspect('c-other', 'p1')).toBe(false);
  });
});
