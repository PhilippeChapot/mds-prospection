/**
 * @vitest-environment jsdom
 *
 * P6.x.4-a-decies — tests footer landing : 3 dates 2026 dans l'ordre
 * chronologique (Bruxelles → Marseille → Paris).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PublicFooter } from './PublicFooter';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

function renderFooter(locale: 'fr' | 'en' = 'fr') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? enMessages : frMessages}>
      <PublicFooter />
    </NextIntlClientProvider>,
  );
}

describe('PublicFooter (P6.x.4-a-decies)', () => {
  it('FR — rend les 3 dates 2026 dans l’ordre chronologique (Bruxelles → Marseille → Paris)', () => {
    renderFooter('fr');
    const heading = screen.getByText('Événements 2026');
    const list = heading.parentElement!.querySelector('ul');
    expect(list).not.toBeNull();
    const items = Array.from(list!.querySelectorAll('li')).map((li) => li.textContent);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatch(/26 novembre 2026.*Mix Brussels/);
    expect(items[1]).toMatch(/10 décembre 2026.*Palais du Pharo/);
    expect(items[2]).toMatch(/15 décembre 2026.*Carrousel du Louvre/);
  });

  it('EN — rend les 3 dates 2026 traduites dans le même ordre chronologique', () => {
    renderFooter('en');
    const heading = screen.getByText('2026 events');
    const list = heading.parentElement!.querySelector('ul');
    const items = Array.from(list!.querySelectorAll('li')).map((li) => li.textContent);
    expect(items[0]).toMatch(/November 26, 2026.*Mix Brussels/);
    expect(items[1]).toMatch(/December 10, 2026.*Palais du Pharo/);
    expect(items[2]).toMatch(/December 15, 2026.*Carrousel du Louvre/);
  });
});
