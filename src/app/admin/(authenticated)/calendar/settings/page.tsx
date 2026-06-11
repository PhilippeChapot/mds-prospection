/**
 * P14.1.SalesCalendarCore (Commit 5) — page settings calendrier sales.
 * P14.2.SalesCalendarGoogleSync — ajoute la section sync Google Calendar.
 *
 * Permet a l user de :
 *   - Voir son URL .ics personnelle pour subscription Apple/Google Calendar.
 *   - Regenerer le token (invalide l ancienne URL).
 *   - Connecter / déconnecter Google Calendar (sync bidirectionnelle + Meet).
 *
 * RBAC : tous roles admin (chacun voit ses propres paramètres).
 */

import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getIcsTokenAction } from '@/lib/admin/calendar/ics-token-actions';
import { getGoogleSyncStatusAction } from '@/lib/admin/calendar/google/connect-actions';
import {
  listAdminUsersForCalendarAction,
  listVisibleCalendarUsersAction,
} from '@/lib/admin/calendar/collaboration-actions';
import type { AdminLocale } from '@/lib/admin/calendar/i18n-helpers';
import { IcsSettingsClient } from './_components/IcsSettingsClient';
import { GoogleSyncSettingsClient } from './_components/GoogleSyncSettingsClient';
import { CalendarVisibilitySettings } from './_components/CalendarVisibilitySettings';

export const metadata = { title: 'Paramètres calendrier' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ google?: string; reason?: string }>;

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  'https://www.mediadays.solutions';

export default async function CalendarSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const profile = await requireAdminProfile();
  const params = await searchParams;

  // Locale admin depuis users.language (fallback fr).
  const supabase = getSupabaseServiceClient();
  const { data: userRow } = await supabase
    .from('users')
    .select('language')
    .eq('id', profile.id)
    .maybeSingle();
  const locale: AdminLocale = (userRow?.language ?? 'FR').toLowerCase() === 'en' ? 'en' : 'fr';

  const [icsRes, googleRes, usersRes, visibilityRes] = await Promise.all([
    getIcsTokenAction(),
    getGoogleSyncStatusAction(),
    listAdminUsersForCalendarAction(),
    listVisibleCalendarUsersAction(),
  ]);
  const initialUrl = icsRes.ok ? `${BASE_URL}/api/calendar/ics/${icsRes.token}` : null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-md-blue-dark text-2xl font-extrabold tracking-tight md:text-3xl">
          ⚙️ Paramètres calendrier
        </h1>
        <p className="text-md-text-muted mt-1 text-sm">
          Synchronise tes évènements MDS avec Apple Calendar ou Google Calendar.
        </p>
      </header>

      {googleRes.ok && (
        <GoogleSyncSettingsClient
          initialStatus={googleRes.data}
          locale={locale}
          justConnected={params.google === 'connected'}
          connectionError={params.google === 'error' ? (params.reason ?? 'unknown') : null}
        />
      )}

      <IcsSettingsClient initialUrl={initialUrl} initialError={icsRes.ok ? null : icsRes.error} />

      {usersRes.ok && usersRes.users.length > 0 && (
        <section className="bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
            👥 Visibilité des calendriers
          </h2>
          <p className="text-md-text-muted text-xs">
            Voir les évènements de vos collègues dans votre vue calendrier.
          </p>
          <CalendarVisibilitySettings
            allUsers={usersRes.users}
            initialVisibleUserIds={visibilityRes.ok ? visibilityRes.visibleUserIds : []}
          />
        </section>
      )}
    </div>
  );
}
