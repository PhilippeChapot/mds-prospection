/**
 * P14.1.HOTFIX-i18n-Calendar — helpers de traduction FR/EN des enum values DB.
 *
 * Contexte : les enum values DB sont en snake_case anglais (call_relance,
 * no_response, pending, etc.) — c est OK pour la DB, mais le rendu UI doit
 * les traduire. Avant ce fix, on faisait `value.replace(/_/g, ' ')` qui
 * affichait "no response" au lieu de "Pas de réponse".
 *
 * Convention admin actuelle : pas de next-intl, tout en FR hardcode. Ces
 * helpers acceptent un `locale` en argument (default 'fr') pour preparer
 * l i18n future sans casser la convention actuelle. Les composants client
 * passent le locale via prop si besoin EN, sinon FR par defaut.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : pure
 * functions, pas de 'use server'. Importable de partout.
 */

import type { CalendarEventType, CalendarEventStatus, CalendarEventPriority } from './helpers';

export type AdminLocale = 'fr' | 'en';

// ─── Status ───
export const EVENT_STATUS_LABELS: Record<CalendarEventStatus, Record<AdminLocale, string>> = {
  pending: { fr: 'En attente', en: 'Pending' },
  done: { fr: 'Fait', en: 'Done' },
  cancelled: { fr: 'Annulé', en: 'Cancelled' },
  missed: { fr: 'Manqué', en: 'Missed' },
};

export function getStatusLabel(status: CalendarEventStatus, locale: AdminLocale = 'fr'): string {
  return EVENT_STATUS_LABELS[status][locale];
}

// ─── Outcome ───
// Les valeurs DB d outcome sont les 8 cas humains de COMMON_OUTCOMES.
// On supporte aussi le fallback "outcome libre" (toute autre string) :
// elle s affiche telle quelle (humanisee via replace(/_/g, ' ')).
export const COMMON_OUTCOME_VALUES = [
  'no_response',
  'reached_recall_later',
  'demo_booked',
  'meeting_booked',
  'qualified',
  'not_interested',
  'lost',
  'wrong_contact',
] as const;
export type CommonOutcome = (typeof COMMON_OUTCOME_VALUES)[number];

export const EVENT_OUTCOME_LABELS: Record<CommonOutcome, Record<AdminLocale, string>> = {
  no_response: { fr: 'Pas de réponse', en: 'No response' },
  reached_recall_later: { fr: 'Joint — à relancer', en: 'Reached — recall later' },
  demo_booked: { fr: 'Démo prise', en: 'Demo booked' },
  meeting_booked: { fr: 'RDV pris', en: 'Meeting booked' },
  qualified: { fr: 'Qualifié', en: 'Qualified' },
  not_interested: { fr: 'Non intéressé', en: 'Not interested' },
  lost: { fr: 'Perdu', en: 'Lost' },
  wrong_contact: { fr: 'Mauvais contact', en: 'Wrong contact' },
};

export function getOutcomeLabel(outcome: string | null, locale: AdminLocale = 'fr'): string | null {
  if (!outcome) return null;
  if ((COMMON_OUTCOME_VALUES as readonly string[]).includes(outcome)) {
    return EVENT_OUTCOME_LABELS[outcome as CommonOutcome][locale];
  }
  // Outcome libre (texte saisi a la main par l user) → humanise les
  // underscores mais garde le texte original.
  return outcome.replace(/_/g, ' ');
}

// ─── Event type ───
export const EVENT_TYPE_LABELS: Record<CalendarEventType, Record<AdminLocale, string>> = {
  call_relance: { fr: 'Appel de relance', en: 'Follow-up call' },
  meeting: { fr: 'Rendez-vous', en: 'Meeting' },
  task: { fr: 'Tâche', en: 'Task' },
};

export function getEventTypeLabel(type: CalendarEventType, locale: AdminLocale = 'fr'): string {
  return EVENT_TYPE_LABELS[type][locale];
}

/**
 * Forme courte (sans "de relance" / "Follow-up") pour les boutons et
 * filtres compact. Cf. EVENT_TYPE_LABELS pour le label complet.
 */
export const EVENT_TYPE_SHORT_LABELS: Record<CalendarEventType, Record<AdminLocale, string>> = {
  call_relance: { fr: 'Appel', en: 'Call' },
  meeting: { fr: 'RDV', en: 'Meeting' },
  task: { fr: 'Tâche', en: 'Task' },
};

export function getEventTypeShortLabel(
  type: CalendarEventType,
  locale: AdminLocale = 'fr',
): string {
  return EVENT_TYPE_SHORT_LABELS[type][locale];
}

// ─── Priority ───
export const EVENT_PRIORITY_LABELS: Record<CalendarEventPriority, Record<AdminLocale, string>> = {
  low: { fr: 'Basse', en: 'Low' },
  normal: { fr: 'Normale', en: 'Normal' },
  high: { fr: 'Haute', en: 'High' },
};

export function getPriorityLabel(
  priority: CalendarEventPriority,
  locale: AdminLocale = 'fr',
): string {
  return EVENT_PRIORITY_LABELS[priority][locale];
}
