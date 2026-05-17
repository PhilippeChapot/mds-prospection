/**
 * P6.x.4-a-ter — helper Vitest pour wrapper les composants landing avec
 * NextIntlClientProvider et la locale demandée.
 */

import type { ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

const MESSAGES = { fr: frMessages, en: enMessages } as const;

export function renderI18n(
  ui: ReactNode,
  opts: { locale?: 'fr' | 'en' } & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { locale = 'fr', ...rest } = opts;
  return render(ui, {
    ...rest,
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}
