'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';

export async function updateCompanyNotesAction(companyId: string, notes: string) {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    throw new Error('Seul un admin peut editer les notes de societe.');
  }
  const trimmed = notes.length > 4000 ? notes.slice(0, 4000) : notes;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('companies')
    .update({ notes: trimmed || null, updated_at: new Date().toISOString() })
    .eq('id', companyId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/companies/${companyId}`);
}

export async function deleteCompanyAction(companyId: string) {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    throw new Error('Seul un admin peut supprimer une societe.');
  }
  const supabase = await createSupabaseServerClient();

  // Empeche la suppression si des prospects pointent vers cette societe.
  // Le FK est ON DELETE CASCADE — si on laisse passer, on perd des prospects.
  const { count: prospectCount } = await supabase
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);

  if ((prospectCount ?? 0) > 0) {
    throw new Error(
      `Impossible : ${prospectCount} prospect(s) lie(s). Supprime ou reaffecte les prospects d'abord.`,
    );
  }

  const { error } = await supabase.from('companies').delete().eq('id', companyId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/companies');
  redirect('/admin/companies');
}
