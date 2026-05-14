import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { EditCompanyForm, type EditableCompany } from './EditCompanyForm';

export const metadata = { title: 'Editer la societe' };

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireAdminProfile();

  // Sales ne peut pas editer une societe (RLS le bloquerait, mais on redirige
  // l'UI pour eviter une page d'erreur).
  if (profile.role !== 'admin') {
    redirect(`/admin/companies/${id}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: company } = await supabase
    .from('companies')
    .select(
      `
      id, name, primary_domain, alternate_domains, country, category, was_prs_2026_exhibitor,
      pole:poles(code)
    `,
    )
    .eq('id', id)
    .maybeSingle();

  if (!company) notFound();

  const pole = pickFirst(company.pole);

  const editable: EditableCompany = {
    id: company.id,
    name: company.name,
    primary_domain: company.primary_domain,
    alternate_domains: company.alternate_domains ?? [],
    country: company.country,
    category: company.category,
    pole_code: pole?.code ?? 'INCONNU',
    was_prs_2026_exhibitor: company.was_prs_2026_exhibitor,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Editer la societe
        </h1>
        <p className="text-md-text-muted text-sm">{company.name}</p>
      </header>

      <EditCompanyForm company={editable} />
    </div>
  );
}

type MaybeArray<T> = T | T[] | null | undefined;
function pickFirst<T>(value: MaybeArray<T>): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
