import { redirect } from 'next/navigation';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { listSettings } from '@/lib/admin/preferences/queries';
import { PreferencesClient } from './PreferencesClient';

export const metadata = { title: 'Préférences' };
export const dynamic = 'force-dynamic';

export default async function PreferencesPage() {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    redirect('/admin?error=admin_only');
  }

  const settings = await listSettings();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Préférences · {settings.length}
        </h1>
        <p className="text-md-text-muted text-sm">
          Réglages globaux de l&apos;app (finance, intégrations, feature flags, etc.). Les clés
          connues sont typées et validées via le registry. Vous pouvez aussi ajouter des clés custom
          en JSON brut.
        </p>
      </header>

      <PreferencesClient
        initialSettings={settings}
        currentRole={profile.role}
        currentUserId={profile.id}
      />
    </div>
  );
}
