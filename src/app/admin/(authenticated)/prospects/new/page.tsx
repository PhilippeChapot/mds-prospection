import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { NewProspectForm, type PrefillContact } from './NewProspectForm';

export const metadata = { title: 'Nouveau prospect' };

type SearchParams = Promise<{ company_id?: string; contact_id?: string }>;

export default async function NewProspectPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireAdminProfile();
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  // P5.x.24 — owners + prefill from ?contact_id ou ?company_id.
  // La combobox société charge ses options en lazy via /api/admin/companies/search,
  // donc plus besoin de précharger 500 sociétés ici.
  const [{ data: owners }, prefillContactRow, prefillCompanyRow] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, email, role')
      .in('role', ['admin', 'sales'])
      .order('full_name', { ascending: true }),
    params.contact_id
      ? supabase
          .from('contacts')
          .select(
            `id, email, first_name, last_name, phone, role, is_primary, language, company_id,
             company:companies!inner(id, name, primary_domain)`,
          )
          .eq('id', params.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    !params.contact_id && params.company_id
      ? supabase
          .from('companies')
          .select('id, name, primary_domain')
          .eq('id', params.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ownersOptions = (owners ?? []).map((o) => ({
    id: o.id,
    label: `${o.full_name?.trim() || o.email} · ${o.role}`,
  }));

  // Normalisation du prefill contact (avec company embarquée)
  let prefillContact: PrefillContact | null = null;
  if (prefillContactRow && 'data' in prefillContactRow && prefillContactRow.data) {
    const c = prefillContactRow.data as {
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      role: string | null;
      is_primary: boolean;
      language: 'FR' | 'EN';
      company_id: string;
      company:
        | { id: string; name: string; primary_domain: string | null }
        | { id: string; name: string; primary_domain: string | null }[]
        | null;
    };
    const co = Array.isArray(c.company) ? c.company[0] : c.company;
    prefillContact = {
      id: c.id,
      email: c.email,
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      role: c.role,
      is_primary: c.is_primary,
      language: c.language,
      company_id: c.company_id,
      company_name: co?.name ?? '',
      company_primary_domain: co?.primary_domain ?? null,
    };
  }

  // Si prefill contact → check si ce contact est déjà primary sur un prospect actif
  let alreadyProspectIds: string[] = [];
  if (prefillContact) {
    const { data: prospects } = await supabase
      .from('prospects')
      .select('id')
      .eq('primary_contact_id', prefillContact.id)
      .limit(5);
    alreadyProspectIds = (prospects ?? []).map((p) => p.id);
  }

  // Si pas de prefill contact mais prefill company → company_id seul
  const prefillCompanyOnly =
    !prefillContact && prefillCompanyRow && 'data' in prefillCompanyRow && prefillCompanyRow.data
      ? {
          id: prefillCompanyRow.data.id,
          name: prefillCompanyRow.data.name,
          primary_domain: prefillCompanyRow.data.primary_domain,
        }
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Nouveau prospect
        </h1>
        <p className="text-md-text-muted text-sm">
          Choisissez une societe existante (ou creez-en une), selectionnez ou creez un contact, et
          le pack vise.
        </p>
      </header>

      <NewProspectForm
        owners={ownersOptions}
        currentUser={profile}
        prefillContact={prefillContact}
        prefillCompany={prefillCompanyOnly}
        alreadyProspectIds={alreadyProspectIds}
      />
    </div>
  );
}
