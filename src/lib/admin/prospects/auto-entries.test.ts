/**
 * @vitest-environment node
 *
 * P14.4.ProspectTimelineAutoEntries — tests mapper audit_log → AutoEntry.
 *
 * Pure function (no IO) → tests rapides sans mock supabase.
 */

import { describe, it, expect } from 'vitest';
import { mapAuditLogToAutoEntry } from './timeline-helpers';

type Row = Parameters<typeof mapAuditLogToAutoEntry>[0];

function makeRow(overrides: Partial<Row>): Row {
  return {
    id: 'audit-1',
    user_id: 'u1',
    entity_type: 'prospects',
    entity_id: 'p1',
    action: 'update',
    before: null,
    after: null,
    created_at: '2026-06-08T10:00:00Z',
    ...overrides,
  };
}

describe('mapAuditLogToAutoEntry (P14.4)', () => {
  it('status_changed via kind hint → kind + content "Statut → X"', () => {
    const r = makeRow({ after: { kind: 'status_changed', status: 'devis_envoye' } });
    const out = mapAuditLogToAutoEntry(r);
    expect(out.kind).toBe('status_changed');
    expect(out.content).toContain('devis_envoye');
  });

  it('stand_assigned → content inclut number + salle', () => {
    const r = makeRow({
      after: { kind: 'stand_assigned', stand_number: 'A-12', stand_salle: 'Audio' },
    });
    const out = mapAuditLogToAutoEntry(r);
    expect(out.kind).toBe('stand_assigned');
    expect(out.content).toMatch(/A-12/);
    expect(out.content).toMatch(/Audio/);
  });

  it('stripe_payment_received → content inclut montant formaté + type', () => {
    const r = makeRow({
      after: { kind: 'stripe_payment_received', amount_eur: 1500, payment_type: 'acompte_30pct' },
    });
    const out = mapAuditLogToAutoEntry(r);
    expect(out.kind).toBe('stripe_payment_received');
    expect(out.content).toContain('1');
    expect(out.content).toContain('500');
    expect(out.content).toContain('acompte_30pct');
  });

  it('signup_converted → kind + email present', () => {
    const r = makeRow({
      after: { kind: 'signup_converted', email: 'l@mediarun.fr', signup_id: 's1' },
    });
    const out = mapAuditLogToAutoEntry(r);
    expect(out.kind).toBe('signup_converted');
    expect(out.content).toContain('l@mediarun.fr');
  });

  it('booth_assigned → content "Emplacement → X"', () => {
    const r = makeRow({ after: { kind: 'booth_assigned', booth_assignment: 'E5' } });
    const out = mapAuditLogToAutoEntry(r);
    expect(out.kind).toBe('booth_assigned');
    expect(out.content).toContain('E5');
  });

  it('booth_cleared → content libéré', () => {
    const r = makeRow({ after: { kind: 'booth_cleared', booth_assignment: null } });
    expect(mapAuditLogToAutoEntry(r).kind).toBe('booth_cleared');
  });

  it('prospect_edited avec owner_changed → kind owner_changed', () => {
    const r = makeRow({
      after: {
        kind: 'prospect_edited',
        owner_changed: { from: 'u1', to: 'u2' },
      },
    });
    expect(mapAuditLogToAutoEntry(r).kind).toBe('owner_changed');
  });

  it('prospect_edited avec status_changed sub-key → kind status_changed', () => {
    const r = makeRow({
      after: {
        kind: 'prospect_edited',
        status_changed: { from: 'lead', to: 'contact' },
      },
    });
    const out = mapAuditLogToAutoEntry(r);
    expect(out.kind).toBe('status_changed');
    expect(out.content).toContain('contact');
  });

  it('quote_emit_success → kind + content "Devis Sellsy émis"', () => {
    const r = makeRow({
      after: { kind: 'quote_emit_success', devis_number: 'DEV-2026-0042' },
    });
    const out = mapAuditLogToAutoEntry(r);
    expect(out.kind).toBe('quote_emit_success');
    expect(out.content).toContain('DEV-2026-0042');
  });

  it('Fallback heuristique status diff sans kind hint', () => {
    const r = makeRow({
      before: { status: 'lead' },
      after: { status: 'devis_envoye' },
    });
    const out = mapAuditLogToAutoEntry(r);
    expect(out.kind).toBe('status_changed');
  });

  it('Row sans kind hint et sans pattern → unknown (filtré côté caller)', () => {
    const r = makeRow({ before: null, after: null });
    expect(mapAuditLogToAutoEntry(r).kind).toBe('unknown');
  });
});
