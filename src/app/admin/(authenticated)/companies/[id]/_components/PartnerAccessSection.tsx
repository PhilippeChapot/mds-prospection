/**
 * P11.x.MultiPartnerAccess — section "Accès espace partenaire" sur fiche société.
 *
 * Server component : fetch les grants actifs, passe les données aux client
 * components (PartnerAccessGrantRow, GrantPartnerAccessModal).
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { isSuperAdmin } from '@/lib/auth/role-helpers';

const asDb = (c: ReturnType<typeof getSupabaseServiceClient>): SupabaseClient =>
  c as unknown as SupabaseClient;
import { PartnerAccessGrantRow, type GrantRowData } from './PartnerAccessGrantRow';
import { GrantPartnerAccessModal, type ContactOption } from './GrantPartnerAccessModal';

interface Props {
  companyId: string;
  allContacts: ContactOption[];
  adminRole: string;
}

export async function PartnerAccessSection({ companyId, allContacts, adminRole }: Props) {
  const supabase = getSupabaseServiceClient();
  const superAdmin = isSuperAdmin(adminRole);

  // Fetch des grants actifs avec contact + granter
  const { data: raw } = (await asDb(supabase)
    .from('partner_access_grants')
    .select(
      `id, role, granted_at, last_login_at,
       contact:contacts!contact_id(id, first_name, last_name, email),
       granted_by:users!granted_by_user_id(full_name)`,
    )
    .eq('company_id', companyId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: true })) as { data: unknown[] | null };

  const grants: GrantRowData[] = (raw ?? []).map((r: unknown) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      role: row.role as 'owner' | 'collaborator' | 'viewer',
      granted_at: row.granted_at as string,
      last_login_at: (row.last_login_at as string | null) ?? null,
      contact: (Array.isArray(row.contact)
        ? row.contact[0]
        : row.contact) as GrantRowData['contact'],
      granted_by_name: Array.isArray(row.granted_by)
        ? (((row.granted_by[0] as Record<string, unknown>)?.full_name as string | null) ?? null)
        : (((row.granted_by as Record<string, unknown> | null)?.full_name as string | null) ??
          null),
    };
  });

  // Contacts éligibles = ceux qui n'ont pas encore de grant actif
  const activeContactIds = new Set(grants.map((g) => g.contact.id));
  const availableContacts = allContacts.filter((c) => !activeContactIds.has(c.id) && c.email);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-md-text-muted text-sm">
          {grants.length === 0
            ? 'Aucun accès accordé'
            : `${grants.length} accès actif${grants.length > 1 ? 's' : ''}`}
        </span>
        <GrantPartnerAccessModal companyId={companyId} availableContacts={availableContacts} />
      </div>

      {grants.length === 0 ? (
        <div className="text-md-text-muted rounded-lg border border-dashed p-4 text-center text-sm">
          Personne n&apos;a accès à l&apos;espace partenaire pour cette société.
          <br />
          Cliquez sur &quot;Donner accès à un contact&quot; pour créer un premier accès.
        </div>
      ) : (
        <div className="divide-y">
          {grants.map((g) => (
            <PartnerAccessGrantRow key={g.id} grant={g} isSuperAdmin={superAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}
