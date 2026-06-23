/**
 * @vitest-environment jsdom
 *
 * P5.x.SmartAddApolloEnrichment — régression : après création réussie via
 * l'étape 0 (ApolloEnrichSection), on NE redirige PLUS directement vers la
 * fiche prospect ; on affiche le bandeau « décideurs » Apollo + un bouton
 * « Continuer ».
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, refresh: vi.fn(), replace: vi.fn() }),
}));

// Stub du bandeau : évite de charger la chaîne 'use server' (search-decision-makers).
vi.mock('@/components/admin/apollo/ApolloDecisionMakersBanner', () => ({
  ApolloDecisionMakersBanner: ({ companyId }: { companyId: string }) => (
    <div data-testid="dm-banner">{companyId}</div>
  ),
}));

const enrichResult = {
  ok: true as const,
  apolloOrg: { id: 'apollo-org-1' },
  existing: null,
  mapped: {
    name: 'Elgato',
    primary_domain: 'elgato.com',
    industry: 'hardware',
    city: 'Munich',
    country: 'DE',
    postal_code: '80331',
    raw_address: 'Elgato HQ',
    description: 'Stream gear',
    employee_count: 200,
    estimated_revenue_eur: 1000000,
    founded_year: 2010,
    linkedin_url: 'https://linkedin.com/company/elgato',
    parent_company: null,
  },
};

vi.mock('@/lib/admin/smart-add/apollo-actions', () => ({
  enrichApolloAction: vi.fn(async () => enrichResult),
  getApolloCreditUsageAction: vi.fn(async () => ({ ok: true, usage: null })),
  createProspectFromApolloAction: vi.fn(async () => ({
    ok: true,
    prospect_id: 'prospect-123',
    company_id: 'company-456',
    contact_id: null,
  })),
}));

import { ApolloEnrichSection } from './ApolloEnrichSection';

describe('ApolloEnrichSection — post-création (P5.x régression)', () => {
  beforeEach(() => {
    pushSpy.mockClear();
    // Feature flag décideurs activé pour ce test (off par défaut en prod).
    vi.stubEnv('NEXT_PUBLIC_APOLLO_DECISION_MAKERS_ENABLED', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('après création : affiche le bandeau décideurs et ne redirige PAS', async () => {
    render(<ApolloEnrichSection />);

    // 1. Enrichir par domaine.
    fireEvent.change(screen.getByPlaceholderText(/tf1pub\.fr/i), {
      target: { value: 'elgato.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enrichir|Search/i }));

    // 2. Le bouton de création apparaît une fois le résultat chargé.
    const createBtn = await screen.findByRole('button', { name: /Créer le prospect/i });
    fireEvent.click(createBtn);

    // 3. Bandeau décideurs rendu avec le bon companyId, AUCUN redirect direct.
    await waitFor(() => {
      expect(screen.getByTestId('dm-banner')).toBeTruthy();
    });
    expect(screen.getByTestId('dm-banner').textContent).toBe('company-456');
    expect(pushSpy).not.toHaveBeenCalled();

    // 4. Le bouton "Continuer" déclenche le redirect (et seulement lui).
    fireEvent.click(screen.getByRole('button', { name: /Continuer vers le prospect/i }));
    expect(pushSpy).toHaveBeenCalledWith('/admin/prospects/prospect-123');
  });
});
