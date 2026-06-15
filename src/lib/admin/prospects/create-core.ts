/**
 * P15.2 — créateur de prospect réutilisable (object-based).
 *
 * `createProspectAction` (prospects/new/actions.ts) est lié au FormData du
 * formulaire et fait un redirect(). Pour les conversions croisées on a besoin
 * d'un insert simple à partir d'un contact déjà existant.
 *
 * Server-only (importé par les server actions de conversion).
 */
import { getActiveSeasonId } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import type { ProspectStatus, PackCode } from '@/lib/supabase/constants';

export type InsertProspectFromContactInput = {
  contactId: string;
  companyId: string;
  ownerId: string;
  status?: ProspectStatus;
  packCode?: PackCode;
};

export async function insertProspectFromContact(
  input: InsertProspectFromContactInput,
): Promise<{ prospect_id: string }> {
  const supabase = getSupabaseServiceClient();
  const seasonId = await getActiveSeasonId();

  const { data, error } = await supabase
    .from('prospects')
    .insert({
      season_id: seasonId,
      company_id: input.companyId,
      primary_contact_id: input.contactId,
      owner_id: input.ownerId,
      status: input.status ?? 'lead',
      pack_code: input.packCode ?? 'A_DEFINIR',
      source: 'direct',
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Erreur création prospect.');
  return { prospect_id: data.id };
}
