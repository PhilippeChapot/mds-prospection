/**
 * @vitest-environment node
 *
 * P6.x.SellsyDedupClient — tests mapper P14.4 extension pour les
 * nouvelles auto-entries Sellsy (sellsy_client_resolved + link_set/removed).
 */

import { describe, it, expect } from 'vitest';
import { mapAuditLogToAutoEntry } from './timeline-helpers';

type Row = Parameters<typeof mapAuditLogToAutoEntry>[0];

function makeRow(after: Record<string, unknown>): Row {
  return {
    id: 'a',
    user_id: 'u1',
    entity_type: 'prospects',
    entity_id: 'p1',
    action: 'update',
    before: null,
    after,
    created_at: '2026-06-08T10:00:00Z',
  };
}

describe('mapAuditLogToAutoEntry — Sellsy entries (P6.x.SellsyDedupClient)', () => {
  it('sellsy_client_resolved was_existing=true → "Client Sellsy retrouvé"', () => {
    const out = mapAuditLogToAutoEntry(
      makeRow({
        kind: 'sellsy_client_resolved',
        was_existing: true,
        source: 'siren',
        sellsy_company_id: '52457',
      }),
    );
    expect(out.kind).toBe('sellsy_client_resolved');
    expect(out.content).toMatch(/retrouvé/i);
    expect(out.content).toContain('siren');
  });

  it('sellsy_client_resolved was_existing=false → "Nouveau client Sellsy créé"', () => {
    const out = mapAuditLogToAutoEntry(
      makeRow({
        kind: 'sellsy_client_resolved',
        was_existing: false,
        source: 'created',
      }),
    );
    expect(out.kind).toBe('sellsy_client_resolved');
    expect(out.content).toMatch(/créé/i);
  });

  it('company_sellsy_link_set → content inclut sellsy_name et ID', () => {
    const out = mapAuditLogToAutoEntry(
      makeRow({
        kind: 'company_sellsy_link_set',
        sellsy_name: 'Mediarun SAS',
        sellsy_id: '52457',
      }),
    );
    expect(out.kind).toBe('company_sellsy_link_set');
    expect(out.content).toContain('Mediarun SAS');
    expect(out.content).toContain('52457');
  });

  it('company_sellsy_link_removed → "Client Sellsy délié"', () => {
    const out = mapAuditLogToAutoEntry(
      makeRow({ kind: 'company_sellsy_link_removed', previous_sellsy_id: '12345' }),
    );
    expect(out.kind).toBe('company_sellsy_link_removed');
    expect(out.content).toMatch(/délié/i);
  });
});
