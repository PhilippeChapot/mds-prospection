/**
 * P14.1.SalesCalendarCore — page principale du calendrier sales.
 *
 * RBAC : admin/sales/super_admin via requireAdminProfile. Le shell client
 * gere le fetch des events + filtres + modal de creation/edition.
 */

import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getOAuthToken } from '@/lib/admin/calendar/google/tokens-store';
import { listAdminUsersForCalendarAction } from '@/lib/admin/calendar/collaboration-actions';
import { CalendarShell } from './_components/CalendarShell';

export const metadata = { title: 'Calendrier' };
export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const profile = await requireAdminProfile();
  const [googleToken, usersRes] = await Promise.all([
    getOAuthToken(profile.id),
    listAdminUsersForCalendarAction(),
  ]);
  const googleConnected = !!googleToken && googleToken.sync_enabled;
  const allUsers = usersRes.ok ? usersRes.users : [];
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-md-blue-dark text-2xl font-extrabold tracking-tight md:text-3xl">
          📅 Calendrier
        </h1>
        <p className="text-md-text-muted mt-1 text-sm">
          Vos appels de relance, rendez-vous et tâches. Cliquez sur un créneau pour créer un
          évènement.
        </p>
      </header>
      <CalendarShell
        currentUserId={profile.id}
        currentUserRole={profile.role}
        googleConnected={googleConnected}
        allUsers={allUsers}
      />
    </div>
  );
}
