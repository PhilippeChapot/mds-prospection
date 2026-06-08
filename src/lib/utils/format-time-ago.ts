/**
 * P14.3.ProspectTimelineDrawer — helper format relatif "il y a X minutes".
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : pure
 * function sync, NO 'use server'.
 *
 * - < 7 jours : format relatif via date-fns formatDistanceToNow
 * - >= 7 jours : date absolue via formatParisDateTime (doctrine timezone)
 *
 * Locale FR par defaut (admin = FR-only convention).
 */

import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale/fr';
import { enGB } from 'date-fns/locale/en-GB';
import { formatParisDateTime } from '@/lib/format/dates';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function formatTimeAgo(date: Date | string, locale: 'fr' | 'en' = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';

  const ageMs = Date.now() - d.getTime();
  if (ageMs >= SEVEN_DAYS_MS) {
    // >= 7j : date absolue (plus utile pour passage-de-relais que "il y a 3 semaines").
    return formatParisDateTime(d, locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return formatDistanceToNow(d, {
    addSuffix: true,
    locale: locale === 'fr' ? fr : enGB,
  });
}
