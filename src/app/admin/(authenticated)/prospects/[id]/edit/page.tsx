import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { EditProspectForm, type EditableProspect } from './EditProspectForm';

export const metadata = { title: 'Editer le prospect' };

export default async function EditProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireAdminProfile();
  const supabase = await createSupabaseServerClient();

  const { data: prospect } = await supabase
    .from('prospects')
    .select(
      `
      id, status, pack_code, estimated_amount, notes, owner_id,
      company:companies!inner(id, name),
      contact:contacts!primary_contact_id(id, first_name, last_name, email, phone, role)
    `,
    )
    .eq('id', id)
    .maybeSingle();

  if (!prospect) notFound();

  const company = pickFirst(prospect.company);
  const contact = pickFirst(prospect.contact);
  if (!company) notFound();

  const editable: EditableProspect = {
    id: prospect.id,
    pack_code: prospect.pack_code,
    status: prospect.status,
    estimated_amount: prospect.estimated_amount,
    owner_id: prospect.owner_id,
    notes: prospect.notes,
    company: { id: company.id, name: company.name },
    contact: contact
      ? {
          id: contact.id,
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          phone: contact.phone,
          role: contact.role,
        }
      : null,
  };

  const { data: ownersData } = await supabase
    .from('users')
    .select('id, full_name, email, role')
    .in('role', ['admin', 'sales'])
    .order('full_name', { ascending: true });

  const owners = (ownersData ?? []).map((o) => ({
    id: o.id,
    label: `${o.full_name?.trim() || o.email} · ${o.role}`,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Editer le prospect
        </h1>
        <p className="text-md-text-muted text-sm">
          {company.name} — {contact?.email}
        </p>
      </header>

      <EditProspectForm prospect={editable} owners={owners} currentUser={profile} />
    </div>
  );
}

type MaybeArray<T> = T | T[] | null | undefined;
function pickFirst<T>(value: MaybeArray<T>): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
