/**
 * @vitest-environment jsdom
 *
 * Lot 1 — tests de couverture : hero wording, logos, Paris vedette.
 *
 *   1. Hero FR : titre exact + paragraphe body
 *   2. Hero EN : titre traduit
 *   3. Logo MDS : nouveau chemin MDSLogo_final_*
 *   4. Badge Paris "Édition principale" affiché sur la carte vedette
 */

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EtapesSection } from './EtapesSection';
import { HeaderLogo } from '@/components/brand/HeaderLogo';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

vi.mock('./BruxellesCtaButton', () => ({
  BruxellesCtaButton: ({
    label,
    ariaLabel,
  }: {
    label: string;
    ariaLabel: string;
    className?: string;
  }) => (
    <button type="button" aria-label={ariaLabel}>
      {label}
    </button>
  ),
}));

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

function renderI18n(ui: React.ReactNode, locale: 'fr' | 'en' = 'fr') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'fr' ? frMessages : enMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// ─── Hero i18n ──────────────────────────────────────────────────────────────

describe('Hero wording — Lot 1', () => {
  it('FR tagline = "Le Paris Radio Show s\'enrichit avec MediaDays Solutions"', () => {
    expect(frMessages.home.tagline).toBe("Le Paris Radio Show s'enrichit avec MediaDays Solutions");
  });

  it('FR body présent (second paragraphe)', () => {
    expect(frMessages.home.body).toBeTruthy();
    expect(frMessages.home.body).toContain('Un seul rendez-vous');
  });

  it('EN tagline = "The Paris Radio Show evolves with MediaDays Solutions"', () => {
    expect(enMessages.home.tagline).toBe('The Paris Radio Show evolves with MediaDays Solutions');
  });

  it('EN body présent', () => {
    expect(enMessages.home.body).toBeTruthy();
    expect(enMessages.home.body).toContain('One single event');
  });
});

// ─── Logos ──────────────────────────────────────────────────────────────────

describe('HeaderLogo — nouveau chemin MDSLogo_final_*', () => {
  it('theme=dark → MDSLogo_final_blanc_ligne.svg (fond foncé)', () => {
    render(<HeaderLogo category="standard" theme="dark" />);
    expect(screen.getByAltText('MediaDays Solutions 2026')).toHaveAttribute(
      'src',
      '/brand/MDSLogo_final_blanc_ligne.svg',
    );
  });

  it('theme=light → MDSLogo_final_bleu_ligne.svg (fond clair)', () => {
    render(<HeaderLogo category="standard" theme="light" />);
    expect(screen.getByAltText('MediaDays Solutions 2026')).toHaveAttribute(
      'src',
      '/brand/MDSLogo_final_bleu_ligne.svg',
    );
  });
});

// ─── Etapes — Paris vedette ──────────────────────────────────────────────────

describe('EtapesSection — Paris vedette (Lot 1)', () => {
  it('badge "Édition principale" affiché sur la carte Paris', () => {
    renderI18n(<EtapesSection />);
    expect(screen.getByText(/Édition principale/)).toBeInTheDocument();
  });

  it('EN — badge "Main edition" présent', () => {
    renderI18n(<EtapesSection />, 'en');
    expect(screen.getByText(/Main edition/)).toBeInTheDocument();
  });

  it('Paris apparaît en premier dans le DOM (première carte)', () => {
    renderI18n(<EtapesSection />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings[0]).toBe('MEDIADAYS PARIS');
  });
});
