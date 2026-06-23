/**
 * @vitest-environment node
 *
 * P6.x.7 — régression : la page commander ne doit PLUS rediriger
 * silencieusement quand le prospect est ineligible. Elle doit rendre
 * un composant d'explication in-page (cf. <IneligibleNotice>).
 *
 * Avant P6.x.7, le redirect vers `/dashboard?supplementary=ineligible` était
 * absorbé par `/dashboard/page.tsx` qui re-redirige vers `/dashboard/stand`
 * → l'utilisateur atterrissait sur Mon Stand sans aucune explication.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type React from 'react';

// Mocks hoistés en haut (vi.mock hoist) — pas de top-level vars.
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT_CALLED');
  }),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
}));

const mockWriteCtx = {
  contactId: 'contact-1' as string | null,
  prospectId: 'prospect-uuid-1' as string | null,
  role: 'owner' as string | null,
};

vi.mock('@/lib/espace-partenaire/session', () => ({
  requireEspacePartenaireSession: vi.fn(async () => ({ prospectId: 'prospect-uuid-1' })),
  getPartnerWriteContext: vi.fn(async () => mockWriteCtx),
}));

const mockProspect = {
  id: 'prospect-uuid-1',
  status: 'devis_envoye' as string,
  signed_at: null as string | null,
  contact_email: 'p@editionshf.fr',
  company_name: 'Editions HF',
  company_sellsy_id: '56938402',
};

vi.mock('@/lib/espace-partenaire/supplementary-orders/queries', () => ({
  getProspectForPartenaire: vi.fn(async () => mockProspect),
  getOrderableCatalog: vi.fn(async () => []),
}));

// Stub des composants UI pour permettre le rendu côté node sans React DOM.
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./_components/OrderCatalog', () => ({
  OrderCatalog: () => null,
}));

describe('CommanderPage (P6.x.7 régression)', () => {
  beforeEach(() => {
    mockProspect.status = 'devis_envoye';
    mockProspect.signed_at = null;
    mockWriteCtx.role = 'owner';
    vi.clearAllMocks();
  });

  it('prospect ineligible (signed_at=null) → RENDER in-page notice, PAS de redirect', async () => {
    const { default: CommanderPage } = await import('./page');
    const { redirect } = await import('next/navigation');

    const params = Promise.resolve({ locale: 'fr' as const });
    const result = await CommanderPage({ params });

    expect(redirect).not.toHaveBeenCalled();
    // Le retour est un élément React (JSX), pas undefined/null.
    expect(result).toBeTruthy();
  });

  it('prospect ineligible (status=lead) → toujours pas de redirect', async () => {
    mockProspect.status = 'lead';
    mockProspect.signed_at = null;
    const { default: CommanderPage } = await import('./page');
    const { redirect } = await import('next/navigation');

    const params = Promise.resolve({ locale: 'fr' as const });
    const result = await CommanderPage({ params });

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it('prospect eligible (signe + signed_at) → render catalog (toujours pas de redirect)', async () => {
    mockProspect.status = 'signe';
    mockProspect.signed_at = '2026-05-01T10:00:00Z';
    const { default: CommanderPage } = await import('./page');
    const { redirect } = await import('next/navigation');

    const params = Promise.resolve({ locale: 'fr' as const });
    const result = await CommanderPage({ params });

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it('P11.x : viewer → ViewerNotice (pas de catalog, pas de redirect)', async () => {
    mockProspect.status = 'signe';
    mockProspect.signed_at = '2026-05-01T10:00:00Z';
    mockWriteCtx.role = 'viewer';
    const { default: CommanderPage } = await import('./page');
    const { redirect } = await import('next/navigation');

    const params = Promise.resolve({ locale: 'fr' as const });
    const result = await CommanderPage({ params });

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
