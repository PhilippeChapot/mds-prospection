/**
 * @vitest-environment jsdom
 *
 * P14.2 — CalendarEventFormModal : checkbox Google Meet.
 *
 * Couvre :
 *   - googleConnected=true + type=meeting → checkbox 🎥 visible
 *   - googleConnected=false + type=meeting → checkbox absente
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarEventFormModal } from './CalendarEventFormModal';

vi.mock('@/lib/admin/calendar/actions', () => ({
  createCalendarEventAction: vi.fn(),
  updateCalendarEventAction: vi.fn(),
  deleteCalendarEventAction: vi.fn(),
  markCalendarEventDoneAction: vi.fn(),
  searchContactsForCalendarAction: vi.fn().mockResolvedValue({ ok: true, contacts: [] }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('./CalendarEventAttendeesSection', () => ({
  CalendarEventAttendeesSection: () => null,
}));

describe('CalendarEventFormModal — checkbox Meet (P14.2)', () => {
  it('googleConnected=true + type=meeting → checkbox Meet visible', () => {
    render(
      <CalendarEventFormModal
        mode="create"
        defaultType="meeting"
        currentUserRole="sales"
        googleConnected={true}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    expect(screen.queryByText(/Générer un lien Google Meet/i)).toBeTruthy();
  });

  it('googleConnected=false + type=meeting → checkbox Meet absente', () => {
    render(
      <CalendarEventFormModal
        mode="create"
        defaultType="meeting"
        currentUserRole="sales"
        googleConnected={false}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    expect(screen.queryByText(/Générer un lien Google Meet/i)).toBeNull();
  });
});
