/**
 * @vitest-environment jsdom
 *
 * P14.2 #8+#9 — tests CalendarEventEntry chip timeline.
 *
 * Couvre :
 *   - meet_url → bouton 🎥 cliquable affiché
 *   - attendees → résumé "👥 N (X✅ Y❌)" affiché
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarEventEntry } from './CalendarEventEntry';
import type { TimelineEntry } from '@/lib/admin/prospects/timeline-helpers';

const BASE_ENTRY: TimelineEntry = {
  id: 'e-1',
  prospect_id: 'p-1',
  entry_type: 'calendar_event',
  event_at: '2026-06-15T10:00:00Z',
  actor: { id: 'u1', full_name: 'Phil', email: 'phil@mds.fr' },
  contact: null,
  content: 'RDV Acme',
  calendar_event_type: 'meeting',
  calendar_event_status: 'pending',
  calendar_event_start: '2026-06-15T10:00:00Z',
  calendar_event_end: '2026-06-15T11:00:00Z',
};

describe('CalendarEventEntry — chips Meet + attendees (P14.2 #8+#9)', () => {
  it('entry avec meet_url → lien 🎥 Meet affiché', () => {
    const entry: TimelineEntry = {
      ...BASE_ENTRY,
      meet_url: 'https://meet.google.com/abc-defg-hij',
    };
    render(<CalendarEventEntry entry={entry} />);
    const link = screen.getByRole('link', { name: /meet/i });
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('https://meet.google.com/abc-defg-hij');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('entry avec attendees → résumé "👥 N" avec compteurs ✅/❌', () => {
    const entry: TimelineEntry = {
      ...BASE_ENTRY,
      attendees: [
        { email: 'alice@example.com', responseStatus: 'accepted' },
        { email: 'bob@example.com', responseStatus: 'accepted' },
        { email: 'carol@example.com', responseStatus: 'declined' },
        { email: 'dave@example.com', responseStatus: 'needsAction' },
      ],
    };
    const { container } = render(<CalendarEventEntry entry={entry} />);
    // Doit afficher 4 invités (👥 4)
    expect(container.textContent).toContain('👥 4');
    // 2 acceptés (✅) et 1 refus (❌)
    expect(container.textContent).toContain('2✅');
    expect(container.textContent).toContain('1❌');
  });
});
