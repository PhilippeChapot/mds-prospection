/**
 * @vitest-environment node
 *
 * P5.x.6 — tests dashboard queries.
 *
 * On mocke createSupabaseServerClient pour isoler la logique
 * d'aggregation client-side. Pas d'integration DB ici (couvert par
 * les tests E2E manuels).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Dashboard queries (P5.x.6)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // getFunnelByStatus
  // -------------------------------------------------------------------------

  it('getFunnelByStatus : aggregate counts + euros par statut', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: () =>
        Promise.resolve({
          from: () => ({
            select: () => ({
              eq: () => ({
                eq: () =>
                  Promise.resolve({
                    data: [
                      { status: 'lead', sellsy_devis_total_ttc: null, acompte_amount_eur: null },
                      { status: 'lead', sellsy_devis_total_ttc: null, acompte_amount_eur: null },
                      {
                        status: 'devis_envoye',
                        sellsy_devis_total_ttc: 5000,
                        acompte_amount_eur: null,
                      },
                      {
                        status: 'devis_envoye',
                        sellsy_devis_total_ttc: 3000,
                        acompte_amount_eur: null,
                      },
                      {
                        status: 'acompte_paye',
                        sellsy_devis_total_ttc: 9000,
                        acompte_amount_eur: 2700,
                      },
                      {
                        status: 'paye_integral',
                        sellsy_devis_total_ttc: 6000,
                        acompte_amount_eur: 6000,
                      },
                      { status: 'perdu', sellsy_devis_total_ttc: null, acompte_amount_eur: null },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        }),
    }));

    const { getFunnelByStatus } = await import('./queries');
    const funnel = await getFunnelByStatus('season-1');

    expect(funnel).toHaveLength(6);
    const lead = funnel.find((s) => s.status === 'lead')!;
    expect(lead.count).toBe(2);

    const devis = funnel.find((s) => s.status === 'devis_envoye')!;
    expect(devis.count).toBe(2);
    expect(devis.pipelineEur).toBe(8000);

    const acompte = funnel.find((s) => s.status === 'acompte_paye')!;
    expect(acompte.paidEur).toBe(2700);

    const integral = funnel.find((s) => s.status === 'paye_integral')!;
    expect(integral.count).toBe(1);
    expect(integral.paidEur).toBe(6000);

    const perdu = funnel.find((s) => s.status === 'perdu')!;
    expect(perdu.count).toBe(1);

    // Statut absent -> count 0 (pas signe dans le mock)
    const signe = funnel.find((s) => s.status === 'signe')!;
    expect(signe.count).toBe(0);
    expect(signe.pipelineEur).toBe(0);
  });

  it('getFunnelByStatus : DB error -> retourne 6 lignes a 0', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: () =>
        Promise.resolve({
          from: () => ({
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
              }),
            }),
          }),
        }),
    }));

    const { getFunnelByStatus } = await import('./queries');
    const funnel = await getFunnelByStatus('season-1');
    expect(funnel).toHaveLength(6);
    expect(funnel.every((s) => s.count === 0)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // getRecentActivities — classification transitions
  // -------------------------------------------------------------------------

  it('getRecentActivities : classifie les transitions metier', async () => {
    const seasonId = 'season-1';
    const auditRows = [
      // create -> prospect_created
      {
        id: 'a1',
        action: 'create',
        entity_type: 'prospects',
        entity_id: 'p1',
        before: null,
        after: { season_id: seasonId, sellsy_devis_number: null, status: 'lead' },
        created_at: '2026-05-10T10:00:00Z',
      },
      // sellsy_devis_id NULL -> set : devis_emitted
      {
        id: 'a2',
        action: 'update',
        entity_type: 'prospects',
        entity_id: 'p2',
        before: { season_id: seasonId, sellsy_devis_id: null },
        after: {
          season_id: seasonId,
          sellsy_devis_id: '999',
          sellsy_devis_number: 'D-20260510-1',
        },
        created_at: '2026-05-10T11:00:00Z',
      },
      // signed_at NULL -> set : devis_signed
      {
        id: 'a3',
        action: 'update',
        entity_type: 'prospects',
        entity_id: 'p3',
        before: { season_id: seasonId, signed_at: null },
        after: {
          season_id: seasonId,
          signed_at: '2026-05-10T12:00:00Z',
          sellsy_devis_number: 'D-20260510-2',
        },
        created_at: '2026-05-10T12:00:00Z',
      },
      // acompte_paid_at NULL -> set : acompte_paid
      {
        id: 'a4',
        action: 'update',
        entity_type: 'prospects',
        entity_id: 'p4',
        before: { season_id: seasonId, acompte_paid_at: null },
        after: {
          season_id: seasonId,
          acompte_paid_at: '2026-05-10T13:00:00Z',
          acompte_amount_eur: 2746,
        },
        created_at: '2026-05-10T13:00:00Z',
      },
      // status -> perdu : lost
      {
        id: 'a5',
        action: 'update',
        entity_type: 'prospects',
        entity_id: 'p5',
        before: { season_id: seasonId, status: 'lead' },
        after: { season_id: seasonId, status: 'perdu' },
        created_at: '2026-05-10T14:00:00Z',
      },
      // edit notes seul -> 'other' (filtre out)
      {
        id: 'a6',
        action: 'update',
        entity_type: 'prospects',
        entity_id: 'p6',
        before: { season_id: seasonId, notes: 'old' },
        after: { season_id: seasonId, notes: 'new' },
        created_at: '2026-05-10T15:00:00Z',
      },
      // autre saison -> filtre out
      {
        id: 'a7',
        action: 'create',
        entity_type: 'prospects',
        entity_id: 'p7',
        before: null,
        after: { season_id: 'other-season' },
        created_at: '2026-05-10T16:00:00Z',
      },
    ];

    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: () =>
        Promise.resolve({
          from: (table: string) => {
            if (table === 'audit_log') {
              return {
                select: () => ({
                  eq: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: auditRows, error: null }),
                    }),
                  }),
                }),
              };
            }
            // prospects -> enrichissement company name
            return {
              select: () => ({
                in: () =>
                  Promise.resolve({
                    data: [
                      { id: 'p2', company: { name: 'RCS Europe' } },
                      { id: 'p4', company: { name: 'Audio Brothers' } },
                    ],
                    error: null,
                  }),
              }),
            };
          },
        }),
    }));

    const { getRecentActivities } = await import('./queries');
    const events = await getRecentActivities(seasonId, 10);

    expect(events).toHaveLength(5);
    const types = events.map((e) => e.type);
    expect(types).toContain('prospect_created');
    expect(types).toContain('devis_emitted');
    expect(types).toContain('devis_signed');
    expect(types).toContain('acompte_paid');
    expect(types).toContain('lost');
    expect(types).not.toContain('other'); // edit notes filtre
    expect(events.every((e) => e.id !== 'a7')).toBe(true); // autre saison filtre

    // Enrichissement : devis_emitted (p2) doit contenir "RCS Europe"
    const devis = events.find((e) => e.type === 'devis_emitted')!;
    expect(devis.detail).toContain('RCS Europe');
    expect(devis.detail).toContain('D-20260510-1');

    // acompte_paid : detail contient le montant formate
    const acompte = events.find((e) => e.type === 'acompte_paid')!;
    expect(acompte.detail).toContain('2');
    expect(acompte.detail).toContain('Audio Brothers');
  });
});
