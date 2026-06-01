/**
 * P6.x.8 + P6.x-BURGER-FIX — helpers de formatage de dates avec timeZone explicite.
 *
 * Pourquoi : sans `timeZone: 'Europe/Paris'` sur les calls `toLocaleString` /
 * `toLocaleDateString` / `toLocaleTimeString`, le serveur Vercel (TZ=UTC) et
 * le client (TZ=Europe/Paris à -2h en été) rendent une heure différente
 * sur le même composant 'use client'. Cela déclenche React #418 (hydration
 * mismatch), bail out l'arbre React et tous les onClick environnants
 * deviennent inertes — y compris le burger menu sidebar mobile.
 *
 * Référence : https://react.dev/errors/418
 *
 * DOCTRINE : toute date affichée dans un composant `'use client'` qui inclut
 * HEURES ou MINUTES doit passer par ces helpers (ou spécifier
 * `timeZone: 'Europe/Paris'` explicitement). Les server components (RSC)
 * sont safe car le HTML est sérialisé une seule fois côté serveur, mais
 * un helper unique évite l'oubli quand un component bascule server→client.
 */

export const APP_TIME_ZONE = 'Europe/Paris';

type Locale = 'fr' | 'en';

function resolveLocaleTag(locale?: Locale): string {
  return locale === 'en' ? 'en-GB' : 'fr-FR';
}

const DATETIME_SHORT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: APP_TIME_ZONE,
};

/** "25 mai, 18:18" — format compact pour les badges de sync. */
export function formatDateTimeShortFr(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', DATETIME_SHORT_OPTIONS);
}

/**
 * Datetime complet "25/05/2026 18:18:42". Locale FR par défaut.
 * Remplacement direct de `new Date(iso).toLocaleString('fr-FR')`.
 */
export function formatParisDateTime(
  iso: string | Date,
  locale: Locale = 'fr',
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return date.toLocaleString(resolveLocaleTag(locale), {
    timeZone: APP_TIME_ZONE,
    ...options,
  });
}

/**
 * Date seule (sans heure). Pass options Intl pour customiser
 * (ex: { day:'2-digit', month:'short', year:'numeric' }).
 * Remplacement direct de `new Date(iso).toLocaleDateString('fr-FR', {...})`.
 */
export function formatParisDate(
  iso: string | Date,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
  locale: Locale = 'fr',
): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return date.toLocaleDateString(resolveLocaleTag(locale), {
    timeZone: APP_TIME_ZONE,
    ...options,
  });
}

/**
 * Heure seule "18:18". Options pour ajouter secondes si besoin.
 * Remplacement direct de `new Date(iso).toLocaleTimeString('fr-FR', {...})`.
 */
export function formatParisTime(
  iso: string | Date,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
  locale: Locale = 'fr',
): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return date.toLocaleTimeString(resolveLocaleTag(locale), {
    timeZone: APP_TIME_ZONE,
    ...options,
  });
}
