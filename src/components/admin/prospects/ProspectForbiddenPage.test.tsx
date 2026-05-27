/**
 * @vitest-environment jsdom
 *
 * P5.x.1-quater (bug #3) — tests ProspectForbiddenPage.
 *
 * Cas couverts :
 *   - rend le nom de la societe + le nom du proprietaire
 *   - rend un mailto: si ownerEmail dispose
 *   - fallback "un autre commercial" si nom + email absents
 *   - lien retour vers /admin/prospects present
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProspectForbiddenPage } from './ProspectForbiddenPage';

describe('ProspectForbiddenPage (P5.x.1-quater bug #3)', () => {
  it('affiche le nom de la societe + nom du owner + mailto:', () => {
    render(
      <ProspectForbiddenPage
        companyName="TF1 PUB"
        ownerFullName="Alice Martin"
        ownerEmail="alice@mds.fr"
      />,
    );
    expect(screen.getByText('TF1 PUB')).toBeInTheDocument();
    expect(screen.getAllByText(/Alice Martin/).length).toBeGreaterThan(0);
    const cta = screen.getByRole('link', { name: /Contacter Alice Martin/i });
    expect(cta.getAttribute('href')).toMatch(/^mailto:alice@mds\.fr/);
    expect(cta.getAttribute('href')).toContain('TF1%20PUB');
  });

  it("fallback 'un autre commercial' si pas de nom ni d'email", () => {
    render(
      <ProspectForbiddenPage companyName="Anonyme SA" ownerFullName={null} ownerEmail={null} />,
    );
    expect(screen.getByText('Anonyme SA')).toBeInTheDocument();
    expect(screen.getAllByText(/un autre commercial/i).length).toBeGreaterThan(0);
    // Pas de bouton mailto si pas d'email.
    expect(screen.queryByRole('link', { name: /Contacter/i })).toBeNull();
  });

  it('fallback email si full_name vide (utilise email comme libellé)', () => {
    render(<ProspectForbiddenPage companyName="X" ownerFullName="" ownerEmail="bob@mds.fr" />);
    expect(screen.getAllByText('bob@mds.fr').length).toBeGreaterThan(0);
  });

  it('rend un lien retour vers /admin/prospects', () => {
    render(<ProspectForbiddenPage companyName="X" ownerFullName="A" ownerEmail="a@mds.fr" />);
    const links = screen.getAllByRole('link');
    expect(links.some((l) => l.getAttribute('href') === '/admin/prospects')).toBe(true);
  });
});
