/**
 * P6.x.8 — helpers de formatage de dates avec timeZone explicite.
 *
 * Pourquoi : sans `timeZone: 'Europe/Paris'` sur les calls `toLocaleString` /
 * `toLocaleDateString` / `toLocaleTimeString`, le serveur Vercel (TZ=UTC) et
 * le client (TZ=Europe/Paris à -2h en été) rendent une heure différente
 * sur le même composant 'use client'. Cela déclenche React #418 (hydration
 * mismatch), bail out l'arbre React et tous les onClick environnants
 * deviennent inertes.
 *
 * Référence : https://react.dev/errors/418
 *
 * Toute date affichée dans un composant `'use client'` qui inclut HEURES ou
 * MINUTES doit passer par ces helpers OU spécifier `timeZone: 'Europe/Paris'`
 * dans les options Intl.
 */

export const APP_TIME_ZONE = 'Europe/Paris';

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
