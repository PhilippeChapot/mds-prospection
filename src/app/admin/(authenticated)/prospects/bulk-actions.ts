'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { csvFileName, serializeCsv } from '@/lib/csv';
import { listProspectsPaginated, PROSPECT_STATUSES } from '@/lib/supabase/queries';
import { POLE_CODES } from '@/lib/design-tokens';
import type { Database } from '@/lib/supabase/database.types';

type ProspectStatus = Database['public']['Enums']['prospect_status'];

const StatusSchema = z.enum([
  'lead',
  'contact',
  'devis_envoye',
  'acompte_paye',
  'signe',
  'perdu',
]) satisfies z.ZodType<ProspectStatus>;

export async function bulkUpdateProspectsStatusAction(
  prospectIds: string[],
  status: ProspectStatus,
): Promise<{ updated: number }> {
  await requireAdminProfile();
  const ids = prospectIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) return { updated: 0 };
  StatusSchema.parse(status);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('prospects')
    .update({ status, last_activity_at: new Date().toISOString() })
    .in('id', ids)
    .select('id');
  if (error) throw new Error(error.message);

  revalidatePath('/admin/prospects');
  return { updated: data?.length ?? 0 };
}

export async function bulkUpdateProspectsOwnerAction(
  prospectIds: string[],
  ownerId: string,
): Promise<{ updated: number }> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    throw new Error('Seul un admin peut reassigner un owner.');
  }
  const ids = prospectIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) return { updated: 0 };
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) {
    throw new Error('owner_id invalide.');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('prospects')
    .update({ owner_id: ownerId, last_activity_at: new Date().toISOString() })
    .in('id', ids)
    .select('id');
  if (error) throw new Error(error.message);

  revalidatePath('/admin/prospects');
  return { updated: data?.length ?? 0 };
}

const PACK_LABEL_FR: Record<Database['public']['Enums']['pack_code'], string> = {
  ACCESS: 'ACCESS',
  CLASSIC: 'CLASSIC',
  PREMIUM: 'PREMIUM',
  A_DEFINIR: 'A definir',
};

const STATUS_LABEL_FR: Record<ProspectStatus, string> = {
  lead: 'Lead',
  contact: 'En contact',
  devis_envoye: 'Devis envoye',
  acompte_paye: 'Acompte paye',
  signe: 'Signe',
  perdu: 'Perdu',
};

const CATEGORY_LABEL_FR: Record<Database['public']['Enums']['category_tarif'], string> = {
  prs_exhibitor: 'PRS exposant',
  standard: 'Standard',
  non_eligible: 'Non eligible',
};

export type ExportProspectsFilters = {
  q?: string;
  status?: string;
  pole?: string;
  owner?: string;
  ids?: string[]; // si fourni, override les filtres et exporte uniquement ces ids
};

export async function exportProspectsCsvAction(
  filters: ExportProspectsFilters,
): Promise<{ csv: string; filename: string }> {
  await requireAdminProfile();

  let rows: Awaited<ReturnType<typeof listProspectsPaginated>>['rows'] = [];

  if (filters.ids && filters.ids.length > 0) {
    // Export selection : on bypasse listProspectsPaginated et on fetch directement les ids
    const cleanedIds = filters.ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (cleanedIds.length === 0) {
      throw new Error('Aucun id valide.');
    }
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('prospects')
      .select(
        `
        id, status, pack_code, estimated_amount, owner_id, affiliate_id, is_test, created_at, last_activity_at,
        company:companies!inner(id, name, category, was_prs_2026_exhibitor, pole:poles(code, name_fr)),
        contact:contacts(id, first_name, last_name, email),
        owner:users!prospects_owner_id_fkey(id, full_name, email)
      `,
      )
      .in('id', cleanedIds);
    type RawRow = NonNullable<typeof data>[number] & {
      company: unknown;
      contact: unknown;
      owner: unknown;
    };
    rows = (data ?? []).map((row): (typeof rows)[number] => {
      const r = row as unknown as RawRow;
      const company = pickFirst(r.company) as {
        id: string;
        name: string;
        category: Database['public']['Enums']['category_tarif'];
        was_prs_2026_exhibitor: boolean;
        pole: { code: string; name_fr: string } | { code: string; name_fr: string }[] | null;
      } | null;
      const contact = pickFirst(r.contact);
      const owner = pickFirst(r.owner);
      return {
        id: row.id,
        status: row.status as ProspectStatus,
        pack_code: row.pack_code,
        estimated_amount: row.estimated_amount,
        owner_id: row.owner_id,
        affiliate_id: row.affiliate_id,
        is_test: row.is_test ?? false,
        created_at: row.created_at,
        last_activity_at: row.last_activity_at,
        company: company
          ? {
              id: company.id,
              name: company.name,
              category: company.category,
              was_prs_2026_exhibitor: company.was_prs_2026_exhibitor,
              pole: pickFirst(company.pole) as { code: string; name_fr: string } | null,
            }
          : null,
        contact: contact as (typeof rows)[number]['contact'],
        owner: owner as (typeof rows)[number]['owner'],
      };
    });
  } else {
    const status =
      filters.status && (PROSPECT_STATUSES as string[]).includes(filters.status)
        ? (filters.status as ProspectStatus)
        : null;
    const poleCode =
      filters.pole && (POLE_CODES as readonly string[]).includes(filters.pole)
        ? filters.pole
        : null;
    const result = await listProspectsPaginated({
      q: filters.q?.trim() || undefined,
      status,
      poleCode,
      ownerId: filters.owner || null,
      page: 1,
      perPage: 5000,
    });
    rows = result.rows;
  }

  const csv = serializeCsv(
    [
      { key: 'company_name', label: 'Societe' },
      { key: 'contact_full_name', label: 'Contact' },
      { key: 'contact_email', label: 'Email contact' },
      { key: 'status', label: 'Statut' },
      { key: 'pole', label: 'Pole' },
      { key: 'category', label: 'Categorie' },
      { key: 'pack', label: 'Pack' },
      { key: 'owner', label: 'Owner' },
      { key: 'amount_ht', label: 'Montant HT (€)' },
      { key: 'created_at', label: 'Cree le' },
    ],
    rows.map((row) => ({
      company_name: row.company?.name ?? '',
      contact_full_name: row.contact
        ? [row.contact.first_name, row.contact.last_name].filter(Boolean).join(' ').trim()
        : '',
      contact_email: row.contact?.email ?? '',
      status: STATUS_LABEL_FR[row.status],
      pole: row.company?.pole?.name_fr ?? '',
      category: row.company ? CATEGORY_LABEL_FR[row.company.category] : '',
      pack: PACK_LABEL_FR[row.pack_code],
      owner: row.owner?.full_name?.trim() || row.owner?.email || '',
      amount_ht: row.estimated_amount ?? null,
      created_at: row.created_at.slice(0, 10),
    })),
  );

  return { csv, filename: csvFileName('prospects-export') };
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
