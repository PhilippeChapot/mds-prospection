import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { NewVisitorForm } from './NewVisitorForm';

export const metadata = { title: 'Nouveau visiteur' };

export default async function NewVisitorPage() {
  const profile = await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data: owners } = await supabase
    .from('users')
    .select('id, full_name, email, role')
    .in('role', ['admin', 'sales', 'super_admin'])
    .order('full_name', { ascending: true });

  const ownersOptions = (owners ?? []).map((o) => ({
    id: o.id,
    label: `${o.full_name?.trim() || o.email} · ${o.role}`,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Nouveau visiteur
        </h1>
        <p className="text-md-text-muted text-sm">
          Sélectionnez un contact existant ou créez-en un, puis renseignez les infos visiteur.
        </p>
      </header>

      <NewVisitorForm owners={ownersOptions} currentUser={profile} />
    </div>
  );
}
