/**
 * @vitest-environment jsdom
 *
 * P7.x.1.A-bis — regression test : le module page.tsx de /[locale]/affilie
 * est importable et le component rend l'arbre attendu sans erreur.
 *
 * Sert de garde-fou contre une regression "404 sur /fr/affilie" : si
 * quelqu'un re-deplace les fichiers a la racine `src/app/affilie/` (hors
 * du [locale]/(public)/ route group), le proxy next-intl interceptera et
 * 404era. Ce test rate immediatement parce que l'import echoue.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import frMessages from '@/messages/fr.json';

// setRequestLocale est server-only (throw "Client Components" en jsdom).
// On stub la dependance next-intl/server pour permettre l'appel render.
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
}));

vi.mock('./RequestMagicLinkForm', () => ({
  AffilieRequestMagicLinkForm: () => <form data-testid="magic-form" />,
}));

describe('/[locale]/(public)/affilie/page (P7.x.1.A-bis)', () => {
  it('page.tsx est importable depuis [locale]/(public)/affilie/', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });

  it('rend la card "Espace Affilié" sans erreur quand searchParams=vide', async () => {
    const { default: Page } = await import('./page');
    const ui = await Page({
      params: Promise.resolve({ locale: 'fr' as const }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        {ui}
      </NextIntlClientProvider>,
    );
    expect(container.textContent).toMatch(/Espace Affilié/);
    expect(container.querySelector('[data-testid="magic-form"]')).toBeTruthy();
  });

  it('searchParams.error=expired -> bandeau erreur affiche', async () => {
    const { default: Page } = await import('./page');
    const ui = await Page({
      params: Promise.resolve({ locale: 'fr' as const }),
      searchParams: Promise.resolve({ error: 'expired' }),
    });
    const { container } = render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        {ui}
      </NextIntlClientProvider>,
    );
    expect(container.textContent).toMatch(/Votre lien d.acc.s a expiré/);
  });
});
