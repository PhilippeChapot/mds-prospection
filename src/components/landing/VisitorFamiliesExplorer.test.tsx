/**
 * @vitest-environment jsdom
 *
 * P6.x.4-a — tests grid 14 familles + 3 types de CTA.
 */

import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { VisitorFamiliesExplorer } from './VisitorFamiliesExplorer';
import { InstitutionnelEcoleFormProvider } from './institutionnel-ecole-form-context';
import { getTaxonomy } from '@/lib/landing/taxonomy';
import { renderI18n } from './__test-helpers__/i18n-render';

// Mock le form modal pour éviter de rendre un dialog complet (et son server action)
vi.mock('./InstitutionnelEcoleForm', () => ({
  InstitutionnelEcoleForm: ({ open, type }: { open: boolean; type: string }) =>
    open ? <div data-testid={`form-open-${type}`}>FORM-{type}</div> : null,
}));

const tax = getTaxonomy();

function renderWithProvider(jsx: React.ReactNode, locale: 'fr' | 'en' = 'fr') {
  return renderI18n(<InstitutionnelEcoleFormProvider>{jsx}</InstitutionnelEcoleFormProvider>, {
    locale,
  });
}

describe('VisitorFamiliesExplorer (P6.x.4-a)', () => {
  it('rend les 14 familles', () => {
    renderWithProvider(<VisitorFamiliesExplorer families={tax.visiteurs} poles={tax.poles} />);
    for (const f of tax.visiteurs) {
      expect(screen.getAllByText(f.name).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("P6.x.4-a-bis — famille 'external_mediadays_net' (#1) → CTA externe mediadays.net target=_blank", () => {
    renderWithProvider(<VisitorFamiliesExplorer families={tax.visiteurs} poles={tax.poles} />);
    const annonceurs = tax.visiteurs.find((v) => v.id === 1)!;
    fireEvent.click(screen.getAllByText(annonceurs.name)[0].closest('button')!);
    const cta = screen.getByText(/S.inscrire comme visiteur \(gratuit\)/i).closest('a');
    expect(cta?.getAttribute('href')).toBe('https://mediadays.net');
    expect(cta?.getAttribute('target')).toBe('_blank');
    expect(cta?.getAttribute('rel')).toContain('noopener');
  });

  it("famille 'institutionnel_form' (#11) ouvre la modale avec type=institutionnel au clic CTA", () => {
    renderWithProvider(<VisitorFamiliesExplorer families={tax.visiteurs} poles={tax.poles} />);
    const fam11 = tax.visiteurs.find((v) => v.id === 11)!;
    fireEvent.click(screen.getAllByText(fam11.name)[0].closest('button')!);
    fireEvent.click(screen.getByText(/Demander un tarif Institutionnel/i));
    expect(screen.getByTestId('form-open-institutionnel')).toBeTruthy();
  });

  it('P6.x.4-a-bis — famille 11 affiche AUSSI un CTA secondaire mediadays.net externe', () => {
    renderWithProvider(<VisitorFamiliesExplorer families={tax.visiteurs} poles={tax.poles} />);
    const fam11 = tax.visiteurs.find((v) => v.id === 11)!;
    fireEvent.click(screen.getAllByText(fam11.name)[0].closest('button')!);
    const visiteurLink = screen.getByText(/S.inscrire comme visiteur \(gratuit\)/i).closest('a');
    expect(visiteurLink?.getAttribute('href')).toBe('https://mediadays.net');
    expect(visiteurLink?.getAttribute('target')).toBe('_blank');
  });

  it("famille 'ecole_form' (#13) ouvre la modale avec type=ecole au clic CTA", () => {
    renderWithProvider(<VisitorFamiliesExplorer families={tax.visiteurs} poles={tax.poles} />);
    const fam13 = tax.visiteurs.find((v) => v.id === 13)!;
    fireEvent.click(screen.getAllByText(fam13.name)[0].closest('button')!);
    fireEvent.click(screen.getByText(/Demander un tarif École/i));
    expect(screen.getByTestId('form-open-ecole')).toBeTruthy();
  });

  it('P6.x.4-a-sexies — drawer ouvert : bouton fermer présent (FR aria-label="Fermer", touch 44x44)', () => {
    renderWithProvider(<VisitorFamiliesExplorer families={tax.visiteurs} poles={tax.poles} />);
    const fam = tax.visiteurs.find((v) => v.id === 1)!;
    fireEvent.click(screen.getAllByText(fam.name)[0].closest('button')!);
    const closeBtn = screen.getByRole('button', { name: 'Fermer' });
    expect(closeBtn).toBeTruthy();
    expect(closeBtn.className).toMatch(/h-11/);
    expect(closeBtn.className).toMatch(/w-11/);
  });

  it('P6.x.4-a-sexies — bouton fermer aria-label="Close" en EN', () => {
    renderWithProvider(
      <VisitorFamiliesExplorer families={tax.visiteurs} poles={tax.poles} />,
      'en',
    );
    const fam = tax.visiteurs.find((v) => v.id === 1)!;
    // En EN les noms de familles sont en anglais — on ouvre la première
    // carte trouvée plutôt que de matcher un nom localisé.
    const allCards = screen.getAllByRole('button');
    // Première vraie card (les boutons d'ouverture sont des <button>)
    fireEvent.click(allCards.find((b) => b.textContent?.includes('#1')) ?? allCards[0]);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('P6.x.4-a-sexies — click sur bouton fermer ferme bien le drawer', () => {
    renderWithProvider(<VisitorFamiliesExplorer families={tax.visiteurs} poles={tax.poles} />);
    const fam = tax.visiteurs.find((v) => v.id === 1)!;
    fireEvent.click(screen.getAllByText(fam.name)[0].closest('button')!);
    // Le drawer est ouvert (familyHeading "Famille #1 · ..." présent)
    expect(screen.getAllByText(/Famille #1 ·/).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByText(/Famille #1 ·/)).toBeNull();
  });
});
