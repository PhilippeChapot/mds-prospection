/**
 * @vitest-environment jsdom
 *
 * Lot 1 — PublicTopbar : bouton sticky "M'inscrire comme partenaire".
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PublicTopbar } from './PublicTopbar';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string | { pathname: string; query?: Record<string, string> };
    children: React.ReactNode;
  } & React.HTMLAttributes<HTMLAnchorElement>) => {
    const url =
      typeof href === 'string'
        ? href
        : `${href.pathname}${
            href.query
              ? '?' +
                Object.entries(href.query)
                  .map(([k, v]) => `${k}=${v}`)
                  .join('&')
              : ''
          }`;
    return (
      <a href={url} {...rest}>
        {children}
      </a>
    );
  },
}));

vi.mock('@/components/brand/HeaderLogo', () => ({
  HeaderLogo: () => <div data-testid="header-logo" />,
}));

vi.mock('@/components/public/LocaleSwitcher', () => ({
  LocaleSwitcher: () => <div data-testid="locale-switcher" />,
}));

function renderTopbar(locale: 'fr' | 'en' = 'fr') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? enMessages : frMessages}>
      <PublicTopbar />
    </NextIntlClientProvider>,
  );
}

describe('PublicTopbar — Lot 1 CTA sticky', () => {
  it('FR — bouton "M\'inscrire comme partenaire" (sm+) et "S\'inscrire" (mobile) présents', () => {
    renderTopbar('fr');
    expect(screen.getByText("M'inscrire comme partenaire")).toBeInTheDocument();
    expect(screen.getByText("S'inscrire")).toBeInTheDocument();
  });

  it('FR — lien du bouton CTA pointe vers /inscription-partenaire?category=partenaire', () => {
    renderTopbar('fr');
    const link = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href')?.includes('inscription-partenaire'));
    expect(link).toBeDefined();
    expect(link!.getAttribute('href')).toBe('/inscription-partenaire?category=partenaire');
  });

  it('EN — bouton traduit "Register as a partner" présent', () => {
    renderTopbar('en');
    expect(screen.getByText('Register as a partner')).toBeInTheDocument();
    expect(screen.getByText('Register')).toBeInTheDocument();
  });
});
