/**
 * P6.x.4-a — embed Canva static iframe (présentation MediaDays).
 *
 * P6.x.4-a-ter : titre / sous-titre / iframe title via next-intl.
 * P6.x.4-a-quinquies : URL Canva différenciée par locale (FR vs EN). Avant
 * ce fix, l'URL FR était hardcodée — la version /en/ affichait donc le
 * Canva français malgré les labels traduits autour.
 *
 * `useLocale()` est universel next-intl : fonctionne en Server Component
 * dès lors que la page racine a appelé `setRequestLocale(locale)` (cf.
 * src/app/[locale]/(public)/page.tsx P6.x.4-a).
 *
 * Comparaison stricte `=== 'en'` (au lieu de `CANVA_URLS[locale]`) : plus
 * robuste si la locale arrive avec un casing/format inattendu — fallback
 * automatique sur FR (langue par défaut MDS).
 */

import { useLocale, useTranslations } from 'next-intl';

export const CANVA_URLS = {
  fr: 'https://www.canva.com/design/DAHJ3nuKMro/usLzmtOR_EVUFLtGDRULBA/view?embed',
  en: 'https://www.canva.com/design/DAHJ31nTEq0/view?embed',
} as const;

export function CanvaEmbed() {
  const t = useTranslations('landing.canva');
  const locale = useLocale();
  const canvaSrc = locale === 'en' ? CANVA_URLS.en : CANVA_URLS.fr;
  return (
    <section className="mx-auto my-16 max-w-5xl px-6">
      <div className="mb-8 text-center">
        <h2 className="text-md-blue-dark mb-2 text-3xl font-bold md:text-4xl">{t('title')}</h2>
        <p className="text-md-text-muted">{t('subtitle')}</p>
      </div>
      <div
        className="mx-auto max-w-4xl"
        style={{
          position: 'relative',
          width: '100%',
          height: 0,
          paddingTop: '56.25%',
          boxShadow: '0 2px 8px 0 rgba(63,69,81,0.16)',
          marginTop: '1.6em',
          marginBottom: '0.9em',
          overflow: 'hidden',
          borderRadius: '8px',
        }}
      >
        <iframe
          loading="lazy"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            padding: 0,
            margin: 0,
          }}
          src={canvaSrc}
          allowFullScreen
          allow="fullscreen"
          title={t('iframeTitle')}
        />
      </div>
    </section>
  );
}
