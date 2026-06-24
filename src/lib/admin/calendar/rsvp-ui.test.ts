/**
 * @vitest-environment node
 *
 * P14.x.RSVP-UI — helpers couleur/récap/badges (purs).
 */

import { describe, it, expect } from 'vitest';
import {
  computeRsvpColor,
  computeRsvpSummary,
  formatRsvpSummary,
  canResendIndividual,
  RSVP_BADGE,
} from './rsvp-ui';
import type { AttendeeRecord, AttendeeResponseStatus } from './helpers';

function a(status: AttendeeResponseStatus, extra: Partial<AttendeeRecord> = {}): AttendeeRecord {
  return {
    email: `${status}-${Math.round(extra.sent_at ? 1 : 0)}@x.fr`,
    responseStatus: status,
    ...extra,
  };
}

describe('computeRsvpColor — 8 cas (P14.x)', () => {
  it('tous accepted → vert', () => {
    expect(computeRsvpColor([a('accepted'), a('accepted')], 'meeting')?.borderColor).toBe(
      '#10b981',
    );
  });
  it('tous declined (0 accepted) → rouge', () => {
    expect(computeRsvpColor([a('declined'), a('declined')], 'meeting')?.borderColor).toBe(
      '#ef4444',
    );
  });
  it('mixed declined + accepted → ambre', () => {
    expect(computeRsvpColor([a('declined'), a('accepted')], 'meeting')?.borderColor).toBe(
      '#f59e0b',
    );
  });
  it('tentative seul (0 declined) → jaune', () => {
    expect(computeRsvpColor([a('tentative'), a('needsAction')], 'meeting')?.borderColor).toBe(
      '#eab308',
    );
  });
  it('tous needsAction → gris', () => {
    expect(computeRsvpColor([a('needsAction'), a('needsAction')], 'meeting')?.borderColor).toBe(
      '#94a3b8',
    );
  });
  it('needsAction + accepted → bleu', () => {
    expect(computeRsvpColor([a('needsAction'), a('accepted')], 'meeting')?.borderColor).toBe(
      '#3b82f6',
    );
  });
  it('non-meeting → null (couleur par défaut)', () => {
    expect(computeRsvpColor([a('accepted')], 'call_relance')).toBeNull();
  });
  it('aucun invité → null', () => {
    expect(computeRsvpColor([], 'meeting')).toBeNull();
  });
});

describe('computeRsvpSummary / formatRsvpSummary', () => {
  it('compte correctement les statuts', () => {
    const s = computeRsvpSummary([a('accepted'), a('accepted'), a('declined'), a('needsAction')]);
    expect(s).toMatchObject({ total: 4, accepted: 2, declined: 1, needsAction: 1, tentative: 0 });
  });
  it('formate le récap FR', () => {
    const s = computeRsvpSummary([a('accepted'), a('accepted'), a('declined'), a('needsAction')]);
    const str = formatRsvpSummary(s, 'fr');
    expect(str).toContain('✅ 2');
    expect(str).toContain('❌ 1');
    expect(str).toContain('⏳ 1');
  });
});

describe('RSVP_BADGE', () => {
  it('4 statuts → 4 className distincts', () => {
    const classes = new Set([
      RSVP_BADGE.accepted.className,
      RSVP_BADGE.declined.className,
      RSVP_BADGE.tentative.className,
      RSVP_BADGE.needsAction.className,
    ]);
    expect(classes.size).toBe(4);
  });
});

describe('canResendIndividual', () => {
  const now = new Date('2026-06-25T12:00:00Z').getTime();
  it('needsAction + invité > 24h → true', () => {
    expect(
      canResendIndividual(
        { email: 'x@y.fr', responseStatus: 'needsAction', sent_at: '2026-06-24T00:00:00Z' },
        now,
      ),
    ).toBe(true);
  });
  it('needsAction mais invité < 24h → false', () => {
    expect(
      canResendIndividual(
        { email: 'x@y.fr', responseStatus: 'needsAction', sent_at: '2026-06-25T11:00:00Z' },
        now,
      ),
    ).toBe(false);
  });
  it('déjà répondu (accepted) → false', () => {
    expect(
      canResendIndividual(
        { email: 'x@y.fr', responseStatus: 'accepted', sent_at: '2026-06-23T00:00:00Z' },
        now,
      ),
    ).toBe(false);
  });
  it('sans sent_at → false', () => {
    expect(canResendIndividual({ email: 'x@y.fr', responseStatus: 'needsAction' }, now)).toBe(
      false,
    );
  });
});
