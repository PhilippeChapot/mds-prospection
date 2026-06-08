/**
 * @vitest-environment jsdom
 *
 * P14.3-bis.NotesLegacyMerge — tests ProspectQuickNoteForm.
 *
 * Couvre :
 *   - Submit button disabled tant que textarea vide (anti spam).
 *   - onOpenDrawer trigger via click sur "Voir l historique".
 *   - Ctrl+Enter shortcut submit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProspectQuickNoteForm } from './ProspectQuickNoteForm';

const createActionMock = vi.fn(async () => ({ ok: true as const, id: 'note-1' }));
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('@/lib/admin/prospects/notes-actions', () => ({
  createProspectNoteAction: (...args: unknown[]) => createActionMock(...args),
}));

describe('ProspectQuickNoteForm (P14.3-bis)', () => {
  beforeEach(() => {
    createActionMock.mockClear();
    refreshMock.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('Submit button disabled tant que textarea vide', () => {
    render(<ProspectQuickNoteForm prospectId="p1" noteCount={0} onOpenDrawer={() => undefined} />);
    const btn = screen.getByRole('button', { name: /Ajouter une note/i });
    expect(btn).toBeDisabled();
  });

  it('onOpenDrawer appelé au click sur "Voir l historique"', () => {
    const onOpenDrawer = vi.fn();
    render(<ProspectQuickNoteForm prospectId="p1" noteCount={3} onOpenDrawer={onOpenDrawer} />);
    fireEvent.click(screen.getByRole('button', { name: /Voir l/i }));
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it('Affiche le compteur de notes', () => {
    render(<ProspectQuickNoteForm prospectId="p1" noteCount={7} onOpenDrawer={() => undefined} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('Ctrl+Enter submit la note', async () => {
    render(<ProspectQuickNoteForm prospectId="p1" noteCount={0} onOpenDrawer={() => undefined} />);
    const textarea = screen.getByPlaceholderText(/Note rapide/i);
    fireEvent.change(textarea, { target: { value: 'Une note test' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    // Wait microtask flush (useTransition).
    await new Promise((r) => setTimeout(r, 0));
    expect(createActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prospect_id: 'p1',
        content: 'Une note test',
        contact_id: null,
      }),
    );
  });
});
