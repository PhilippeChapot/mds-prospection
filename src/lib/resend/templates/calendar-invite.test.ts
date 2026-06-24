/**
 * @vitest-environment node
 *
 * P14.x.CalendarExternalInvites — template invitation (RSVP / cancellation).
 */

import { describe, it, expect } from 'vitest';
import { renderCalendarInvite } from './calendar-invite';

const base = {
  recipientName: 'Client',
  organizerName: 'Philippe',
  eventTitle: 'RDV partenariat',
  startAt: '2026-06-25T09:00:00Z',
  endAt: '2026-06-25T09:30:00Z',
  location: 'Visio',
  description: 'Discuter du pack',
  locale: 'fr' as const,
  appUrl: 'https://www.mediadays.solutions',
  rsvpToken: 'tok-123',
};

describe('renderCalendarInvite (P14.x)', () => {
  it('invitation → sujet + 3 boutons RSVP avec le token', () => {
    const t = renderCalendarInvite({ ...base, kind: 'invitation' });
    expect(t.subject).toContain('Invitation');
    expect(t.html).toContain('/api/calendar/rsvp/tok-123?r=accepted');
    expect(t.html).toContain('r=declined');
    expect(t.html).toContain('r=tentative');
  });

  it('cancellation → pas de boutons RSVP + mention annulation', () => {
    const t = renderCalendarInvite({ ...base, kind: 'cancellation' });
    expect(t.subject).toContain('Annulation');
    expect(t.html).not.toContain('r=accepted');
    expect(t.html.toLowerCase()).toContain('annulé');
  });

  it('EN → libellés anglais', () => {
    const t = renderCalendarInvite({ ...base, kind: 'invitation', locale: 'en' });
    expect(t.subject).toContain('Invitation');
    expect(t.html).toContain('Will you attend?');
  });
});
