/**
 * @vitest-environment jsdom
 *
 * P7.x.1.F — tests UI SocietesTable.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import frMessages from '@/messages/fr.json';
import { SocietesTable } from './SocietesTable';
import type { AffilieClaimRow } from '@/lib/affiliate-claims/queries';

const SAMPLE: AffilieClaimRow[] = [
  {
    id: 'c1',
    affiliateId: 'a',
    companyId: 'co1',
    prospectId: 'p1',
    declaredCompanyName: null,
    declaredCompanyWebsite: null,
    source: 'cookie_tracking',
    status: 'active',
    declaredAt: '2026-05-01T00:00:00Z',
    validatedAt: '2026-05-01T00:00:00Z',
    rejectedReason: null,
    notesAffiliate: null,
    resolvedCompanyName: 'Société Cookie',
    commissionEurHt: 250,
    commissionStatus: 'paid',
  },
  {
    id: 'c2',
    affiliateId: 'a',
    companyId: 'co2',
    prospectId: 'p2',
    declaredCompanyName: null,
    declaredCompanyWebsite: null,
    source: 'declared_by_company',
    status: 'active',
    declaredAt: '2026-05-02T00:00:00Z',
    validatedAt: '2026-05-02T00:00:00Z',
    rejectedReason: null,
    notesAffiliate: null,
    resolvedCompanyName: 'Société Déclarée par elle-même',
    commissionEurHt: 180,
    commissionStatus: 'due',
  },
  {
    id: 'c3',
    affiliateId: 'a',
    companyId: null,
    prospectId: null,
    declaredCompanyName: 'Société Inventée XYZ',
    declaredCompanyWebsite: 'https://xyz.fr',
    source: 'declared_by_affiliate',
    status: 'pending',
    declaredAt: '2026-05-20T00:00:00Z',
    validatedAt: null,
    rejectedReason: null,
    notesAffiliate: 'Démarchée au RadioTour Bruxelles',
    resolvedCompanyName: null,
    commissionEurHt: null,
    commissionStatus: null,
  },
  {
    id: 'c4',
    affiliateId: 'a',
    companyId: null,
    prospectId: null,
    declaredCompanyName: 'Société Refusée',
    declaredCompanyWebsite: null,
    source: 'declared_by_affiliate',
    status: 'rejected',
    declaredAt: '2026-05-21T00:00:00Z',
    validatedAt: '2026-05-21T01:00:00Z',
    rejectedReason: 'Déjà cliente directe',
    notesAffiliate: null,
    resolvedCompanyName: null,
    commissionEurHt: null,
    commissionStatus: null,
  },
];

function renderTable(claims: AffilieClaimRow[]) {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <SocietesTable claims={claims} locale="fr" />
    </NextIntlClientProvider>,
  );
}

describe('SocietesTable (P7.x.1.F)', () => {
  it('rend les 4 sources/status avec badges corrects', () => {
    renderTable(SAMPLE);
    // Sociétés
    expect(screen.getByText('Société Cookie')).toBeInTheDocument();
    expect(screen.getByText('Société Déclarée par elle-même')).toBeInTheDocument();
    expect(screen.getByText('Société Inventée XYZ')).toBeInTheDocument();
    expect(screen.getByText('Société Refusée')).toBeInTheDocument();
    // Badges sources
    expect(screen.getByText(/Cookie tracking/)).toBeInTheDocument();
    expect(screen.getByText(/Déclarée par la société/)).toBeInTheDocument();
    expect(screen.getAllByText(/Déclarée par moi/).length).toBe(2);
    // Status pills
    expect(screen.getAllByText(/Active/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Validation admin/)).toBeInTheDocument();
    expect(screen.getByText(/Rejetée/)).toBeInTheDocument();
    // Rejet : raison visible
    expect(screen.getByText(/Déjà cliente directe/)).toBeInTheDocument();
  });

  it('liste vide -> message empty', () => {
    renderTable([]);
    expect(screen.getByText(/Aucune société rattachée/)).toBeInTheDocument();
  });

  it('commission affichee en EUR FR pour rows active', () => {
    renderTable(SAMPLE);
    // 250,00 € et 180,00 € visibles
    expect(screen.getByText(/250,00\s?€/)).toBeInTheDocument();
    expect(screen.getByText(/180,00\s?€/)).toBeInTheDocument();
  });
});
