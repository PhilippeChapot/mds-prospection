/**
 * @vitest-environment jsdom
 *
 * P7.x.1.D — tests banner exclusion commission + modale liste PRS.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';
import { CommissionExclusionBanner } from './CommissionExclusionBanner';
import type { ExcludedCompany } from '@/lib/affiliates/excluded-companies';

const SAMPLE: ExcludedCompany[] = [
  { id: 'c1', name: 'Radio France', primaryDomain: 'radiofrance.fr' },
  { id: 'c2', name: 'Europe 1', primaryDomain: 'europe1.fr' },
  { id: 'c3', name: 'RTL Group', primaryDomain: null },
];

function renderBanner(locale: 'fr' | 'en' = 'fr', companies: ExcludedCompany[] = SAMPLE) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? enMessages : frMessages}>
      <CommissionExclusionBanner excludedCompanies={companies} />
    </NextIntlClientProvider>,
  );
}

describe('CommissionExclusionBanner (P7.x.1.D)', () => {
  it('FR — affiche le banner avec mention "Paris Radio Show" + lien comptage', () => {
    renderBanner('fr');
    expect(screen.getByText(/Important/)).toBeInTheDocument();
    expect(screen.getByText(/Paris Radio Show 2026/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Voir la liste des exposants exclus \(3\)/ }),
    ).toBeInTheDocument();
  });

  it('EN — mêmes elements en anglais', () => {
    renderBanner('en');
    expect(screen.getByText(/Important/)).toBeInTheDocument();
    expect(screen.getByText(/Paris Radio Show 2026 exhibitors/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /See the list of excluded exhibitors \(3\)/ }),
    ).toBeInTheDocument();
  });

  it('click sur le lien ouvre la modale avec les 3 societes', () => {
    renderBanner('fr');
    expect(screen.queryByText('Radio France')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Voir la liste/ }));
    expect(screen.getByText('Radio France')).toBeInTheDocument();
    expect(screen.getByText('Europe 1')).toBeInTheDocument();
    expect(screen.getByText('RTL Group')).toBeInTheDocument();
    expect(screen.getByText(/3 société\(s\) exclue\(s\)/)).toBeInTheDocument();
  });

  it('search filtre la liste par nom ou domaine', () => {
    renderBanner('fr');
    fireEvent.click(screen.getByRole('button', { name: /Voir la liste/ }));
    const search = screen.getByPlaceholderText(/Rechercher/);
    fireEvent.change(search, { target: { value: 'radio' } });
    expect(screen.getByText('Radio France')).toBeInTheDocument();
    expect(screen.queryByText('Europe 1')).toBeNull();
    expect(screen.queryByText('RTL Group')).toBeNull();
  });

  it('aucune societe -> message empty', () => {
    renderBanner('fr', []);
    fireEvent.click(screen.getByRole('button', { name: /Voir la liste/ }));
    expect(screen.getByText(/Aucun exposant exclu/)).toBeInTheDocument();
  });

  it("RGPD : la table n'expose JAMAIS d'email ou telephone", () => {
    renderBanner('fr');
    fireEvent.click(screen.getByRole('button', { name: /Voir la liste/ }));
    // Aucune colonne email/telephone dans le header
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toContain('Société');
    expect(headers).toContain('Domaine');
    expect(headers).not.toContain('Email');
    expect(headers).not.toContain('Téléphone');
  });
});
