/**
 * P14.1.SalesCalendarCore — localizer react-big-calendar.
 *
 * dateFnsLocalizer wrap avec locales fr/en. La doctrine timezone
 * Europe/Paris [[feedback_force_paris_timezone_doctrine]] s applique cote
 * affichage des dates (helpers @/lib/format/dates), pas ici : react-big-calendar
 * laisse passer les Date natives et les formate via date-fns.
 *
 * Note : react-big-calendar interprete les dates en TZ navigateur. Pour
 * eviter tout drift sur des events dont start_at/end_at sont serialises
 * en UTC (ISO string), on les convertit en Date locale au render. Le
 * navigateur des sales est typiquement Europe/Paris → coherence visuelle.
 * Pour un sales hors-FR, la doctrine recommande de continuer a afficher
 * Europe/Paris : V2 si besoin.
 */

import { dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { fr } from 'date-fns/locale/fr';
import { enGB } from 'date-fns/locale/en-GB';

export const calendarLocales = { fr, en: enGB } as const;

export const calendarLocalizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }), // Lundi
  getDay,
  locales: calendarLocales,
});

/**
 * Messages i18n du toolbar react-big-calendar (boutons Today/Back/Next,
 * labels viewMonth/Week/Day/Agenda, etc.).
 *
 * Format pris par <Calendar messages={...} />.
 */
export function getCalendarMessages(locale: 'fr' | 'en') {
  if (locale === 'en') {
    return {
      allDay: 'All day',
      previous: 'Back',
      next: 'Next',
      today: 'Today',
      month: 'Month',
      week: 'Week',
      day: 'Day',
      agenda: 'Agenda',
      date: 'Date',
      time: 'Time',
      event: 'Event',
      noEventsInRange: 'No event in this range.',
      showMore: (total: number) => `+ ${total} more`,
    };
  }
  return {
    allDay: 'Journée',
    previous: 'Précédent',
    next: 'Suivant',
    today: "Aujourd'hui",
    month: 'Mois',
    week: 'Semaine',
    day: 'Jour',
    agenda: 'Agenda',
    date: 'Date',
    time: 'Heure',
    event: 'Évènement',
    noEventsInRange: 'Aucun événement dans cette plage.',
    showMore: (total: number) => `+ ${total} de plus`,
  };
}
