/**
 * Lot 5 — Remplace l'embed Canva (lent, peu utilisé) par 2 cartes côte à côte :
 *   - Gauche : bouton "Télécharger le Deck" vers Canva public (URL selon locale)
 *   - Droite  : carte contact Philippe Chapot (Coordinateur MDS + PRS)
 */

import { useLocale, useTranslations } from 'next-intl';
import { Download, Mail } from 'lucide-react';

const DECK_URLS = {
  fr: 'https://canva.link/29m0ohjwcpmo15b',
  en: 'https://canva.link/c5uqrizp8gyd4v2',
} as const;

export function DeckAndContactSection() {
  const t = useTranslations('landing.deckContact');
  const locale = useLocale();
  const deckUrl = locale === 'en' ? DECK_URLS.en : DECK_URLS.fr;

  return (
    <section className="bg-white py-16" data-testid="deck-contact-section">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-md-blue-dark mb-12 text-center text-3xl font-extrabold tracking-tight md:text-4xl">
          {t('sectionTitle')}
        </h2>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Gauche — Télécharger le Deck */}
          <div className="flex flex-col rounded-2xl border-2 border-[#0D1D6D] bg-white p-8 shadow-sm">
            <div className="mb-4 text-4xl" aria-hidden>
              📥
            </div>
            <h3 className="text-md-blue-dark mb-3 text-xl font-extrabold">{t('deckTitle')}</h3>
            <p className="text-md-text-muted mb-6 text-sm leading-relaxed">
              {t('deckDescription')}
            </p>
            <div className="mt-auto">
              <a
                href={deckUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="deck-download-link"
                className="inline-flex items-center gap-2 rounded-full bg-[#0D1D6D] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0D1D6D]/90"
              >
                <Download className="size-4" aria-hidden />
                {t('deckButton')}
              </a>
            </div>
          </div>

          {/* Droite — Contact organisateur */}
          <div className="flex flex-col rounded-2xl border-2 border-[#0D1D6D] bg-white p-8 shadow-sm">
            <div className="mb-4 text-4xl" aria-hidden>
              ✉️
            </div>
            <h3 className="text-md-blue-dark mb-3 text-xl font-extrabold">{t('contactTitle')}</h3>
            <p className="text-md-blue-dark mb-1 text-base font-bold">Philippe Chapot</p>
            <p className="text-md-text-muted mb-6 text-sm">{t('contactRole')}</p>
            <div className="mt-auto">
              <a
                href="mailto:philippe@mediadays.solutions"
                data-testid="contact-email-link"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#0D1D6D] transition hover:underline"
              >
                <Mail className="size-4" aria-hidden />
                philippe@mediadays.solutions
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
