import { redirect } from 'next/navigation';
import { listResourcesAction } from '@/lib/partner-resources/actions';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { PartnerResourcesClient } from './PartnerResourcesClient';

export const metadata = { title: 'Ressources partenaire' };
export const dynamic = 'force-dynamic';

export default async function PartnerResourcesPage() {
  // P5.x.1-quater (bug #2) — defense in depth : admin+ only.
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    redirect('/admin?error=admin_only');
  }
  const result = await listResourcesAction();
  const resources = result.ok ? result.data : [];
  const errorMessage = result.ok ? null : result.error;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            Ressources partenaire
          </h1>
          <p className="text-md-text-muted text-sm">
            Guide partenaire, FAQ logistique, chartes graphiques (Markdown bilingue FR/EN).
          </p>
        </div>
      </div>

      {errorMessage ? (
        <div className="border-md-danger/40 bg-md-danger/10 text-md-danger rounded-md border px-3 py-2 text-sm">
          Erreur de chargement : {errorMessage}
        </div>
      ) : null}

      <PartnerResourcesClient resources={resources} />
    </div>
  );
}
