/**
 * P8.1 — helper SYNC (pas 'use server') pour le hook auto-enable a la
 * signature de devis. Importable depuis le webhook Sellsy.
 *
 * Comportement : pour tous les contacts d'une company donnee, on met
 * pref_exposant + pref_administration + pref_facturation a TRUE — sauf
 * pour les contacts dont l'admin a deja locke ces catégories
 * (respect strict du flag _locked_by_admin).
 *
 * Audit log : 1 entree par contact mis a jour, action='update', kind
 * stashe dans after.kind = 'auto_enabled_on_signature'.
 *
 * Best-effort : si la mise a jour echoue (DB down, contact orphelin...),
 * on log mais on ne fait PAS echouer le flow signature (le devis reste
 * signe). Phil peut re-cocher manuellement depuis la fiche société.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[contact-preferences/auto-enable]';

export interface AutoEnableResult {
  contacts_updated: number;
  contacts_skipped_locked: number;
}

export async function autoEnableExpoPreferencesOnSignature(params: {
  prospectId: string;
  companyId: string;
}): Promise<AutoEnableResult> {
  const supabase = getSupabaseServiceClient();

  // 1. Lister tous les contacts de la company (peut etre 1, peut etre N).
  const { data: contacts, error: contactsErr } = await supabase
    .from('contacts')
    .select('id, email')
    .eq('company_id', params.companyId);
  if (contactsErr || !contacts || contacts.length === 0) {
    console.warn(
      '%s no-contacts company=%s prospect=%s msg=%s',
      LOG_PREFIX,
      params.companyId,
      params.prospectId,
      contactsErr?.message ?? 'empty',
    );
    return { contacts_updated: 0, contacts_skipped_locked: 0 };
  }

  let updated = 0;
  let skippedLocked = 0;

  for (const contact of contacts) {
    // Charger l'etat AVANT pour audit before/after.
    const { data: before } = await supabase
      .from('contact_preferences')
      .select(
        'pref_exposant, pref_administration, pref_facturation, exposant_locked_by_admin, administration_locked_by_admin, facturation_locked_by_admin, unsubscribed_all_at',
      )
      .eq('contact_id', contact.id)
      .maybeSingle();

    if (!before) {
      // Trigger create_default_contact_preferences_trigger devrait avoir
      // cree la row a l'insert du contact. Si absente (legacy bug), on
      // l'insere ici defensivement.
      await supabase.from('contact_preferences').insert({ contact_id: contact.id });
      continue;
    }

    // Si unsubscribed_all : skip (le contact a explicitement opt-out).
    if (before.unsubscribed_all_at) {
      skippedLocked++;
      continue;
    }

    // Si les 3 prefs sont locked, on ne touche a rien.
    const allLocked =
      before.exposant_locked_by_admin &&
      before.administration_locked_by_admin &&
      before.facturation_locked_by_admin;
    if (allLocked) {
      skippedLocked++;
      continue;
    }

    // Construire le patch en respectant les locks (n'ecrase pas une
    // catégorie locked, meme si elle est a false).
    const patch: Record<string, unknown> = {
      // updated_by_user_id reste null = "system" (le trigger lock
      // enforcement laisse passer car on respecte les locks ici).
      // Mais le trigger reverte aussi les flags locked, donc on ne
      // touche pas a *_locked_by_admin. Ok.
      updated_at: new Date().toISOString(),
    };
    if (!before.exposant_locked_by_admin) patch.pref_exposant = true;
    if (!before.administration_locked_by_admin) patch.pref_administration = true;
    if (!before.facturation_locked_by_admin) patch.pref_facturation = true;

    const { error: updateErr } = await supabase
      .from('contact_preferences')
      .update(patch as never)
      .eq('contact_id', contact.id);
    if (updateErr) {
      console.warn('%s update-failed contact=%s msg=%s', LOG_PREFIX, contact.id, updateErr.message);
      continue;
    }

    // Audit log (best-effort).
    try {
      await supabase.from('audit_log').insert({
        user_id: null,
        entity_type: 'contact_preferences',
        entity_id: contact.id,
        action: 'update',
        before: {
          pref_exposant: before.pref_exposant,
          pref_administration: before.pref_administration,
          pref_facturation: before.pref_facturation,
        } as never,
        after: {
          kind: 'auto_enabled_on_signature',
          trigger: 'devis_signed',
          prospect_id: params.prospectId,
          actor_role: 'system',
          pref_exposant: !before.exposant_locked_by_admin ? true : before.pref_exposant,
          pref_administration: !before.administration_locked_by_admin
            ? true
            : before.pref_administration,
          pref_facturation: !before.facturation_locked_by_admin ? true : before.pref_facturation,
        } as never,
      });
    } catch (err) {
      console.warn(
        '%s audit-log-failed contact=%s msg=%s',
        LOG_PREFIX,
        contact.id,
        err instanceof Error ? err.message : String(err),
      );
    }

    updated++;
  }

  console.log(
    '%s done prospect=%s company=%s updated=%d skipped_locked=%d',
    LOG_PREFIX,
    params.prospectId,
    params.companyId,
    updated,
    skippedLocked,
  );

  return { contacts_updated: updated, contacts_skipped_locked: skippedLocked };
}
