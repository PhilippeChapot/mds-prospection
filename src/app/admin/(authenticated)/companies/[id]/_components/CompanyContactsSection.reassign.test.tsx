/**
 * @vitest-environment jsdom
 *
 * P5.x.ReassignContactsToCompany — sélection multi sur la liste contacts.
 *
 * Couvre : bouton « Déplacer » disabled à 0 sélectionné, header checkbox
 * tout-cocher, label du bouton (count), ouverture de la modal au clic.
 * La modal réelle est stubbée (sa logique est testée ailleurs : action +
 * helpers).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/contacts/admin-actions', () => ({
  addContactAction: vi.fn(),
  updateContactAction: vi.fn(),
  markAsPrimaryAction: vi.fn(),
  toggleLifecycleAction: vi.fn(),
  deleteContactAction: vi.fn(),
}));
vi.mock('@/lib/admin/contact-preferences/actions', () => ({
  listContactPreferencesByCompanyAction: vi.fn().mockResolvedValue([]),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./ReassignContactsModal', () => ({
  ReassignContactsModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="reassign-modal" /> : null,
}));

import { CompanyContactsSection } from './CompanyContactsSection';
import type { CompanyContactRow } from '@/lib/contacts/admin-queries';

function contact(id: string, email: string, primary = false): CompanyContactRow {
  return {
    id,
    company_id: 'co-1',
    email,
    first_name: 'First',
    last_name: id.toUpperCase(),
    phone: null,
    role: null,
    is_primary: primary,
    language: 'FR',
    marketing_consent: true,
    lifecycle_emails_enabled: true,
    email_deliverability_status: 'unknown',
    brevo_contact_id: null,
    prefs_active_count: 0,
    prefs_locked_count: 0,
    prefs_unsubscribed: false,
  } as unknown as CompanyContactRow;
}

const CONTACTS = [contact('a', 'a@creacast.com', true), contact('b', 'b@creacast.com')];

describe('CompanyContactsSection — sélection multi', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('bouton Déplacer disabled si 0 sélectionné', () => {
    render(<CompanyContactsSection companyId="co-1" contacts={CONTACTS} canDelete canReassign />);
    const btn = screen.getByRole('button', { name: /Déplacer/ });
    expect(btn).toBeDisabled();
  });

  it('header checkbox coche tous les contacts + active le bouton avec le bon count', () => {
    render(<CompanyContactsSection companyId="co-1" contacts={CONTACTS} canDelete canReassign />);
    const selectAll = screen.getByLabelText('Tout sélectionner') as HTMLInputElement;
    fireEvent.click(selectAll);

    expect((screen.getByLabelText('Sélectionner a@creacast.com') as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText('Sélectionner b@creacast.com') as HTMLInputElement).checked).toBe(
      true,
    );

    const btn = screen.getByRole('button', { name: /Déplacer 2 contacts/ });
    expect(btn).not.toBeDisabled();
  });

  it('clic sur le bouton ouvre la modal de réaffectation', () => {
    render(<CompanyContactsSection companyId="co-1" contacts={CONTACTS} canDelete canReassign />);
    fireEvent.click(screen.getByLabelText('Sélectionner a@creacast.com'));
    fireEvent.click(screen.getByRole('button', { name: /Déplacer 1 contact/ }));
    expect(screen.getByTestId('reassign-modal')).toBeInTheDocument();
  });

  it('canReassign=false → pas de checkbox ni bouton Déplacer', () => {
    render(
      <CompanyContactsSection companyId="co-1" contacts={CONTACTS} canDelete canReassign={false} />,
    );
    expect(screen.queryByLabelText('Tout sélectionner')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Déplacer/ })).not.toBeInTheDocument();
  });
});
