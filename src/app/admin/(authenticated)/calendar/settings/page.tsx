/**
 * P14.1.SalesCalendarCore (Commit 5) — page settings calendrier sales.
 *
 * Permet a l user de :
 *   - Voir son URL .ics personnelle pour subscription Apple/Google Calendar.
 *   - Regenerer le token (invalide l ancienne URL).
 *
 * RBAC : tous roles admin (chacun voit son propre token).
 */

import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getIcsTokenAction } from '@/lib/admin/calendar/ics-token-actions';
import { IcsSettingsClient } from './_components/IcsSettingsClient';

export const metadata = { title: 'Paramètres calendrier' };
export const dynamic = 'force-dynamic';

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  'https://www.mediadays.solutions';

export default async function CalendarSettingsPage() {
  await requireAdminProfile();
  const r = await getIcsTokenAction();
  const initialUrl = r.ok ? `${BASE_URL}/api/calendar/ics/${r.token}` : null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-md-blue-dark text-2xl font-extrabold tracking-tight md:text-3xl">
          ⚙️ Paramètres calendrier
        </h1>
        <p className="text-md-text-muted mt-1 text-sm">
          Synchronise tes évènements MDS avec Apple Calendar ou Google Calendar (lecture seule).
        </p>
      </header>

      <IcsSettingsClient initialUrl={initialUrl} initialError={r.ok ? null : r.error} />
    </div>
  );
}
