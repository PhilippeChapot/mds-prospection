'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
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

export async function updateProspectStatusAction(prospectId: string, newStatus: ProspectStatus) {
  await requireAdminProfile();
  const status = StatusSchema.parse(newStatus);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('prospects')
    .update({ status, last_activity_at: new Date().toISOString() })
    .eq('id', prospectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/prospects/${prospectId}`);
  revalidatePath('/admin/prospects');
}

export async function updateProspectNotesAction(prospectId: string, notes: string) {
  await requireAdminProfile();
  const trimmed = notes.length > 4000 ? notes.slice(0, 4000) : notes;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('prospects')
    .update({ notes: trimmed || null, last_activity_at: new Date().toISOString() })
    .eq('id', prospectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/prospects/${prospectId}`);
}

export async function addProspectActivityAction(prospectId: string, body: string) {
  const profile = await requireAdminProfile();
  const text = body.trim();
  if (!text) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('activities').insert({
    prospect_id: prospectId,
    type: 'note',
    body: text,
    user_id: profile.id,
  });
  if (error) throw new Error(error.message);
  // Bump last_activity_at
  await supabase
    .from('prospects')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', prospectId);
  revalidatePath(`/admin/prospects/${prospectId}`);
}

export async function deleteProspectAction(prospectId: string) {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    throw new Error('Seul un admin peut supprimer un prospect.');
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('prospects').delete().eq('id', prospectId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/prospects');
  redirect('/admin/prospects');
}

/**
 * Emet un document Sellsy (devis / proforma / facture) selon le
 * payment_path du prospect. Idempotent : si le document du type
 * correspondant existe deja, runPostConversion ne reemet pas.
 *
 * Utilise par le bouton "Emettre devis Sellsy" sur fiche prospect.
 */
export async function emitSellsyDocumentAction(prospectId: string) {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    throw new Error('Seul un admin peut emettre un document Sellsy.');
  }
  const { runPostConversion } = await import('@/lib/sellsy/post-conversion');
  await runPostConversion(prospectId);
  revalidatePath(`/admin/prospects/${prospectId}`);
}

/**
 * Resynchronise un prospect avec tous les providers externes :
 *   - Sellsy : sync company + individual + opportunity (M2)
 *   - Brevo  : upsert contact + assigner listes lifecycle (M6)
 * Stripe n'a rien a syncer (les Checkout sessions sont creees a la
 * demande lors de l'emission devis_acompte_stripe). Best-effort cote
 * Brevo : si l'upsert echoue, on continue (Sellsy reste OK).
 */
export async function resyncProspectAction(prospectId: string) {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    throw new Error('Seul un admin peut resynchroniser un prospect.');
  }
  // Import dynamique pour eviter d'embarquer les helpers dans le bundle
  // SSR de toutes les pages admin.
  const { syncProspectToSellsy } = await import('@/lib/sellsy/sync-prospect');
  await syncProspectToSellsy(prospectId);

  // Brevo lifecycle (best-effort).
  try {
    const { upsertContactBrevo } = await import('@/lib/brevo/lifecycle');
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('prospects')
      .select(
        `
        id, is_test,
        company:companies!inner(name, category, pole:poles(code)),
        contact:contacts(email, first_name, last_name, language, marketing_consent)
        `,
      )
      .eq('id', prospectId)
      .maybeSingle();
    if (data) {
      const company = Array.isArray(data.company) ? data.company[0] : data.company;
      const contact = Array.isArray(data.contact) ? data.contact[0] : data.contact;
      if (contact?.email) {
        const pole = Array.isArray(company?.pole) ? company?.pole[0]?.code : company?.pole?.code;
        await upsertContactBrevo({
          is_test: data.is_test,
          email: contact.email,
          firstName: contact.first_name,
          lastName: contact.last_name,
          companyName: company?.name ?? null,
          pole: (pole ?? 'INCONNU') as
            | 'AUDIO_RADIO'
            | 'VIDEO_CTV'
            | 'OUTDOOR_DOOH'
            | 'DIFFUSION_INFRA'
            | 'DATA_ADTECH'
            | 'REGIES_RETAIL_MEDIA'
            | 'INCONNU',
          category: company?.category ?? 'standard',
          language: (contact.language ?? 'FR') as 'FR' | 'EN',
          marketingConsent: Boolean(contact.marketing_consent),
        });
        await supabase
          .from('prospects')
          .update({ last_synced_brevo_at: new Date().toISOString() })
          .eq('id', prospectId);
      }
    }
  } catch (err) {
    console.error('[resync] brevo-failed:', err);
  }

  revalidatePath(`/admin/prospects/${prospectId}`);
}

/**
 * Mode "concierge" Phil — generer un Stripe Payment Link custom pour un
 * prospect (montant + description + duree de validite saisis cote dialog).
 * Le lien est ajoute aux notes du prospect (audit trail).
 */
export async function createConciergePaymentLinkAction(input: {
  prospectId: string;
  amountEurHt: number;
  description: string;
  expiresInDays: 1 | 7 | 30;
}): Promise<{ url: string; expiresAt: string }> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    throw new Error('Seul un admin peut generer un Payment Link Stripe.');
  }
  const { createConciergePaymentLink } = await import('@/lib/stripe/payment-link');
  const result = await createConciergePaymentLink(input);
  revalidatePath(`/admin/prospects/${input.prospectId}`);
  return { url: result.url, expiresAt: result.expiresAt };
}

/**
 * Toggle is_test (admin only). Quand true, tous les helpers de sync P4
 * (Sellsy, Stripe, Brevo, VIES) bypass via assertSyncAllowed() qui throw
 * SyncSkippedError.
 */
export async function toggleProspectIsTestAction(prospectId: string, isTest: boolean) {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    throw new Error("Seul un admin peut basculer le mode test d'un prospect.");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('prospects')
    .update({ is_test: isTest, last_activity_at: new Date().toISOString() })
    .eq('id', prospectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/prospects/${prospectId}`);
  revalidatePath('/admin/prospects');
}
