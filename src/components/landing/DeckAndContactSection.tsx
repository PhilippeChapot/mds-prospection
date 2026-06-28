/**
 * Lot 5 fix — Redesign : fond bleu PRS marine, placeholder photo Phil (ronde),
 * boutons rose md-magenta, wording "Consultez" (Canva s'ouvre en ligne, pas download).
 *
 * Photo Philippe Chapot N&B : à déposer dans public/brand/team/philippe-chapot-nb.jpg
 * puis activer le <Image> ci-dessous (actuellement placeholder initiales "PC").
 */

import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink, Mail } from 'lucide-react';

const DECK_URLS = {
  fr: 'https://canva.link/29m0ohjwcpmo15b',
  en: 'https://canva.link/c5uqrizp8gyd4v2',
} as const;

export function DeckAndContactSection() {
  const t = useTranslations('landing.deckContact');
  const locale = useLocale();
  const deckUrl = locale === 'en' ? DECK_URLS.en : DECK_URLS.fr;

  return (
    <section className="bg-[#0D1D6D] py-16" data-testid="deck-contact-section">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="mb-12 text-center text-3xl font-extrabold tracking-tight text-white md:text-4xl">
          {t('sectionTitle')}
        </h2>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Gauche — Consultez le Deck */}
          <div className="flex flex-col rounded-2xl border border-white/20 bg-white/10 p-8">
            <ExternalLink className="mb-4 size-10 text-white/60" aria-hidden />
            <h3 className="mb-3 text-xl font-extrabold text-white">{t('deckTitle')}</h3>
            <p className="mb-6 text-sm leading-relaxed text-white/70">{t('deckDescription')}</p>
            <div className="mt-auto">
              <a
                href={deckUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="deck-download-link"
                className="bg-md-magenta hover:bg-md-magenta-soft inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-sm transition"
              >
                {t('deckButton')}
                <ExternalLink className="size-4" aria-hidden />
              </a>
            </div>
          </div>

          {/* Droite — Contact Philippe Chapot */}
          <div className="flex flex-col items-center rounded-2xl border border-white/20 bg-white/10 p-8 text-center md:items-start md:text-left">
            {/* Placeholder initiales — remplacer par <Image> quand photo déposée */}
            <div
              data-testid="contact-avatar"
              aria-hidden
              className="mb-5 flex h-28 w-28 items-center justify-center self-center rounded-full border-4 border-white bg-white text-3xl font-extrabold text-[#0D1D6D]"
            >
              PC
            </div>
            <h3 className="mb-3 text-xl font-extrabold text-white">{t('contactTitle')}</h3>
            <p className="mb-1 text-base font-bold text-white">Philippe Chapot</p>
            <p className="mb-6 text-sm text-white/70">{t('contactRole')}</p>
            <div className="mt-auto">
              <a
                href="mailto:philippe@mediadays.solutions"
                data-testid="contact-email-link"
                className="bg-md-magenta hover:bg-md-magenta-soft inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-sm transition"
              >
                <Mail className="size-4" aria-hidden />
                {t('contactEmailButton')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
