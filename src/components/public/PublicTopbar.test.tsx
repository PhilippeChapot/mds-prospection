/**
 * @vitest-environment jsdom
 *
 * PublicTopbar — header sticky public.
 * Lot 1 : CTA "M'inscrire" ajouté.
 * Lot 2 fix : CTA retiré (doublon avec le hero bandeau). Garde-fous mis à jour.
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

describe('PublicTopbar', () => {
  it('contient le logo + locale switcher + liens espace partenaire/visiteur', () => {
    renderTopbar('fr');
    expect(screen.getByTestId('header-logo')).toBeInTheDocument();
    expect(screen.getByTestId('locale-switcher')).toBeInTheDocument();
    expect(screen.getByText('Invitation (Visa)')).toBeInTheDocument();
    expect(screen.getByText('Espace Partenaire')).toBeInTheDocument();
  });

  it('Lot 2 fix — pas de lien vers /inscription-partenaire (CTA déplacé dans le bandeau)', () => {
    renderTopbar('fr');
    const links = screen.getAllByRole('link');
    const ctaLink = links.find((a) => a.getAttribute('href')?.includes('inscription-partenaire'));
    expect(ctaLink).toBeUndefined();
  });

  it('EN — liens traduits présents', () => {
    renderTopbar('en');
    expect(screen.getByText('Invitation (Visa)')).toBeInTheDocument();
    expect(screen.getByText('Partner area')).toBeInTheDocument();
  });
});
