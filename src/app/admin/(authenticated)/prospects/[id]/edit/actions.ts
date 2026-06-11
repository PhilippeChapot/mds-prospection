'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import type { Database } from '@/lib/supabase/database.types';

type PackCode = Database['public']['Enums']['pack_code'];
type ProspectStatus = Database['public']['Enums']['prospect_status'];

const PackCodeSchema = z.enum([
  'ACCESS',
  'CLASSIC',
  'PREMIUM',
  'A_DEFINIR',
]) satisfies z.ZodType<PackCode>;
const StatusSchema = z.enum([
  'lead',
  'contact',
  'devis_envoye',
  'acompte_paye',
  'paye_integral',
  'signe',
  'perdu',
]) satisfies z.ZodType<ProspectStatus>;

const InputSchema = z.object({
  prospect_id: z.string().uuid(),
  pack_code: PackCodeSchema,
  status: StatusSchema,
  estimated_amount: z.string().optional(),
  owner_id: z.string().uuid(),
  notes: z.string().trim().max(4000).optional(),

  contact_id: z.string().uuid().optional().or(z.literal('')),
  contact_first_name: z.string().trim().max(120).optional(),
  contact_last_name: z.string().trim().max(120).optional(),
  contact_email: z.string().trim().toLowerCase().email().optional(),
  contact_phone: z.string().trim().max(50).optional(),
  contact_role: z.string().trim().max(250).optional(),
});

export type UpdateProspectState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parseAmountEur(input?: string): number | null {
  if (!input) return null;
  const cleaned = input
    .replace(/[^0-9.,-]/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');
  if (!cleaned) return null;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

export async function updateProspectAction(
  _prev: UpdateProspectState,
  formData: FormData,
): Promise<UpdateProspectState> {
  const profile = await requireAdminProfile();
  const supabase = await createSupabaseServerClient();

  const raw: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === 'string') raw[k] = v;
  });

  // Sales : owner_id force a self
  if (profile.role === 'sales') raw.owner_id = profile.id;

  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || 'form';
      fieldErrors[path] = issue.message;
    }
    return { error: 'Verifiez les champs en erreur.', fieldErrors };
  }
  const data = parsed.data;

  // 1. Update contact si fourni
  if (data.contact_id) {
    const { error: contactErr } = await supabase
      .from('contacts')
      .update({
        first_name: data.contact_first_name || null,
        last_name: data.contact_last_name || null,
        email: data.contact_email!,
        phone: data.contact_phone || null,
        role: data.contact_role || null,
      })
      .eq('id', data.contact_id);
    if (contactErr) {
      return { error: `Erreur contact : ${contactErr.message}` };
    }
  }

  // 2. Capture before pour audit_log diff (P14.4 timeline drawer)
  const { data: before } = await supabase
    .from('prospects')
    .select('pack_code, status, owner_id, estimated_amount')
    .eq('id', data.prospect_id)
    .maybeSingle();

  // 3. Update prospect
  const { error: prospectErr } = await supabase
    .from('prospects')
    .update({
      pack_code: data.pack_code,
      status: data.status,
      estimated_amount: parseAmountEur(data.estimated_amount),
      owner_id: data.owner_id,
      notes: data.notes || null,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', data.prospect_id);
  if (prospectErr) {
    return { error: prospectErr.message };
  }

  // P14.4 : audit_log un seul row par "edit prospect" avec les champs
  // diffes. Le mapper TS regardera `after.kind` pour discriminer.
  if (before) {
    const diff: Record<string, unknown> = { kind: 'prospect_edited' };
    if (before.owner_id !== data.owner_id) {
      diff.owner_changed = { from: before.owner_id, to: data.owner_id };
    }
    if (before.status !== data.status) {
      diff.status_changed = { from: before.status, to: data.status };
    }
    if (before.pack_code !== data.pack_code) {
      diff.pack_changed = { from: before.pack_code, to: data.pack_code };
    }
    // Si quelque chose a change (au-dela de kind), on logge.
    if (Object.keys(diff).length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      await sb.from('audit_log').insert({
        user_id: profile.id,
        entity_type: 'prospects',
        entity_id: data.prospect_id,
        action: 'update',
        before: {
          owner_id: before.owner_id,
          status: before.status,
          pack_code: before.pack_code,
        },
        after: diff,
      });
    }
  }

  revalidatePath(`/admin/prospects/${data.prospect_id}`);
  revalidatePath('/admin/prospects');
  redirect(`/admin/prospects/${data.prospect_id}`);
}
