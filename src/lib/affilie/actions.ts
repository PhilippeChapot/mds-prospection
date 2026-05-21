'use server';

/**
 * Server actions self-service Espace Affilie — P7.x.1.C
 *
 * Actions accessibles cote affilie connecte (verifie via cookie + JWT).
 * Pas d'admin profile (l'affilie n'est pas dans auth.users). Le filtre
 * `id = session.affiliateId` cote serveur garantit l'isolation entre
 * affilies (un affilie ne peut JAMAIS modifier les donnees d'un autre).
 *
 * P7.x.1.C bundle :
 *   - updateAffiliateBankingAction : iban / bic / nom_titulaire_compte
 *
 * Audit log : INSERT dans audit_log avec entity_type='affiliates' et
 * user_id=null (pas d'admin behind the action) + before/after pour
 * trace RGPD du changement de coordonnees bancaires.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAffilieSession } from './session';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[affilie/actions]';

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// updateAffiliateBankingAction
// ---------------------------------------------------------------------------

/**
 * Validation IBAN : format europeen `[A-Z]{2}\d{2}[A-Z0-9]+`.
 * Pas de checksum mod-97 (out of scope V1 — Phil pourra ajouter une
 * verification API banque en V2 si besoin). On normalise en uppercase
 * + strip des espaces.
 *
 * BIC : 8 ou 11 caracteres `[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?`.
 * Optionnel (certains affilies hors EU peuvent avoir un IBAN sans BIC).
 */
const bankingSchema = z.object({
  iban: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, '').toUpperCase())
    .pipe(
      z
        .string()
        .min(15, 'IBAN trop court (min 15 caracteres).')
        .max(34, 'IBAN trop long (max 34 caracteres).')
        .regex(/^[A-Z]{2}\d{2}[A-Z0-9]+$/, 'Format IBAN invalide.'),
    ),
  bic: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Format BIC invalide (8 ou 11 caracteres).')
    .optional()
    .or(z.literal('')),
  nom_titulaire_compte: z.string().trim().min(2, 'Minimum 2 caracteres.').max(200),
});

export type UpdateBankingInput = z.input<typeof bankingSchema>;

export async function updateAffiliateBankingAction(
  locale: string,
  input: UpdateBankingInput,
): Promise<ActionResult<{ affiliateId: string }>> {
  const { affiliateId } = await requireAffilieSession(locale);
  const parsed = bankingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }
  const data = parsed.data;

  const supabase = getSupabaseServiceClient();

  // Snapshot before pour audit log (RGPD : trace des modifs de coordonnees
  // bancaires sensibles).
  const { data: before } = await supabase
    .from('affiliates')
    .select('iban, bic, nom_titulaire_compte')
    .eq('id', affiliateId)
    .maybeSingle();

  const { error } = await supabase
    .from('affiliates')
    .update({
      iban: data.iban,
      bic: data.bic || null,
      nom_titulaire_compte: data.nom_titulaire_compte,
      updated_at: new Date().toISOString(),
    })
    .eq('id', affiliateId);

  if (error) {
    console.error('%s update-failed affiliate=%s msg=%s', LOG_PREFIX, affiliateId, error.message);
    return { ok: false, error: error.message };
  }

  // Audit log — best-effort, on ne fail pas l'action si l'insert echoue.
  try {
    await supabase.from('audit_log').insert({
      user_id: null,
      action: 'update',
      entity_type: 'affiliates',
      entity_id: affiliateId,
      before: {
        kind: 'banking_update',
        iban_set: !!before?.iban,
        bic_set: !!before?.bic,
        nom_titulaire_set: !!before?.nom_titulaire_compte,
      } as never,
      after: {
        kind: 'banking_update',
        iban_set: true,
        bic_set: !!data.bic,
        nom_titulaire_set: true,
        actor: 'affiliate_self',
      } as never,
    });
  } catch (err) {
    console.warn(
      '%s audit-log-failed affiliate=%s msg=%s',
      LOG_PREFIX,
      affiliateId,
      err instanceof Error ? err.message : String(err),
    );
  }

  console.log('%s banking-updated affiliate=%s', LOG_PREFIX, affiliateId);
  revalidatePath(`/${locale}/affilie/dashboard/profil`);
  return { ok: true, data: { affiliateId } };
}
