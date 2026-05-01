import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { NewProspectForm } from './NewProspectForm';

export const metadata = { title: 'Nouveau prospect' };

type SearchParams = Promise<{ company_id?: string }>;

export default async function NewProspectPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireAdminProfile();
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: companies }, { data: owners }] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name, primary_domain')
      .order('name', { ascending: true })
      .limit(500),
    supabase
      .from('users')
      .select('id, full_name, email, role')
      .in('role', ['admin', 'sales'])
      .order('full_name', { ascending: true }),
  ]);

  const ownersOptions = (owners ?? []).map((o) => ({
    id: o.id,
    label: `${o.full_name?.trim() || o.email} · ${o.role}`,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Nouveau prospect
        </h1>
        <p className="text-md-text-muted text-sm">
          Choisissez une societe existante (ou creez-en une), saisissez le contact principal et le
          pack vise.
        </p>
      </header>

      <NewProspectForm
        companies={companies ?? []}
        owners={ownersOptions}
        currentUser={profile}
        prefillCompanyId={params.company_id}
      />
    </div>
  );
}
