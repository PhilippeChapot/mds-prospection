'use server';

/**
 * P5.x.ManualPaymentRecording — enregistrement manuel d'un paiement reçu
 * (typiquement virement PRS) directement dans Sellsy + maj du prospect.
 *
 * Réutilise notifySellsyPaymentReceived (flow 2 étapes quirk #24) avec un
 * payment_method_id explicite résolu depuis les env vars
 * SELLSY_PAYMENT_METHOD_ID_* (découverts via GET /v2/payments/methods).
 *
 * Note 'use server' : exporte uniquement des fonctions async (schéma local).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { notifySellsyPaymentReceived } from '@/lib/sellsy/payments';

const recordSchema = z.object({
  prospect_id: z.string().uuid(),
  payment_type: z.enum(['acompte', 'solde', 'ajustement']),
  amount_ttc: z.number().positive(),
  paid_at: z.string().min(4), // ISO date (YYYY-MM-DD ou datetime)
  method: z.enum(['virement', 'cheque', 'stripe_manuel', 'especes', 'autre']),
  reference: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  also_update_status: z.boolean().default(true),
});

export type RecordManualPaymentInput = z.input<typeof recordSchema>;
export type RecordManualPaymentResult =
  | { ok: true; sellsy_payment_id: number | null; status_updated: boolean }
  | { ok: false; error: string };

/** method → (env var, libellé Sellsy lisible). */
function methodEnvVar(method: RecordManualPaymentInput['method']): string {
  switch (method) {
    case 'virement':
      return 'SELLSY_PAYMENT_METHOD_ID_VIREMENT';
    case 'cheque':
      return 'SELLSY_PAYMENT_METHOD_ID_CHEQUE';
    case 'stripe_manuel':
      return 'SELLSY_PAYMENT_METHOD_ID_STRIPE';
    case 'especes':
      return 'SELLSY_PAYMENT_METHOD_ID_ESPECES';
    case 'autre':
      return 'SELLSY_PAYMENT_METHOD_ID_AUTRE';
  }
}

export async function recordManualPaymentAction(
  input: RecordManualPaymentInput,
): Promise<RecordManualPaymentResult> {
  const profile = await requireAdminProfile();
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Paramètres invalides' };
  }
  const data = parsed.data;

  // 1. Résoudre la méthode → payment_method_id Sellsy (env var requise).
  const envVar = methodEnvVar(data.method);
  const rawId = process.env[envVar];
  const paymentMethodId = rawId ? Number(rawId) : NaN;
  if (!Number.isFinite(paymentMethodId) || paymentMethodId <= 0) {
    return {
      ok: false,
      error: `Méthode "${data.method}" non configurée : ajoutez ${envVar} dans les variables d'environnement Vercel.`,
    };
  }

  // 2. Récup prospect + documents Sellsy émis.
  const supabase = getSupabaseServiceClient();
  const { data: prospect, error: pErr } = await supabase
    .from('prospects')
    .select(
      'id, status, acompte_amount_eur, sellsy_invoice_id, sellsy_proforma_id, sellsy_devis_id',
    )
    .eq('id', data.prospect_id)
    .maybeSingle();
  if (pErr || !prospect) {
    return { ok: false, error: 'Prospect introuvable' };
  }

  // 3. Détecter la collection/doc à allouer (priorité facture).
  let documentType: 'invoice' | 'proforma' | 'estimate';
  let documentId: number;
  let sellsyCollection: string;
  if (prospect.sellsy_invoice_id) {
    documentType = 'invoice';
    documentId = Number(prospect.sellsy_invoice_id);
    sellsyCollection = 'invoices';
  } else if (prospect.sellsy_proforma_id) {
    documentType = 'proforma';
    documentId = Number(prospect.sellsy_proforma_id);
    sellsyCollection = 'deposit-invoices';
  } else if (prospect.sellsy_devis_id) {
    documentType = 'estimate';
    documentId = Number(prospect.sellsy_devis_id);
    sellsyCollection = 'estimates';
  } else {
    return {
      ok: false,
      error: 'Aucune facture, pro-forma ni devis Sellsy émis — émettez un document avant.',
    };
  }

  // 4. Créer + lier le paiement dans Sellsy (best-effort sur le link, mais
  //    si la CRÉATION échoue → on n'altère PAS le prospect).
  const note =
    data.notes?.trim() ||
    `Paiement ${data.payment_type} ${data.method}${data.reference ? ` réf ${data.reference}` : ''}`;
  const sellsy = await notifySellsyPaymentReceived({
    prospectId: data.prospect_id,
    documentId,
    documentType,
    amountEur: data.amount_ttc,
    paymentMethod: data.method,
    paymentMethodId,
    reference: data.reference ?? undefined,
    paidAt: new Date(data.paid_at).toISOString(),
    note,
  });
  if (sellsy.paymentId === null) {
    return { ok: false, error: `Sellsy: ${sellsy.error ?? 'création du paiement échouée'}` };
  }

  // 5. Maj prospect : statut + acompte cumulé. Seulement pour acompte/solde
  //    ET si also_update_status. 'ajustement' n'altère jamais le prospect.
  let statusUpdated = false;
  if (data.payment_type !== 'ajustement' && data.also_update_status) {
    const target =
      data.payment_type === 'solde' ? ('paye_integral' as const) : ('acompte_paye' as const);
    const advances =
      target === 'paye_integral'
        ? prospect.status !== 'paye_integral'
        : prospect.status !== 'acompte_paye' && prospect.status !== 'paye_integral';

    const patch: Record<string, unknown> = {
      acompte_amount_eur: Number(prospect.acompte_amount_eur ?? 0) + data.amount_ttc,
      acompte_paid_at: new Date(data.paid_at).toISOString(),
      last_activity_at: new Date().toISOString(),
    };
    if (advances) {
      patch.status = target;
      statusUpdated = true;
    }
    await supabase
      .from('prospects')
      .update(patch as never)
      .eq('id', data.prospect_id);

    // Sync stand + Brevo best-effort (mirroir d'updateProspectStatusAction).
    if (advances) {
      try {
        const { syncStandStatusFromProspect } = await import('@/lib/admin/stands/actions');
        await syncStandStatusFromProspect(data.prospect_id);
        revalidatePath('/admin/emplacements');
      } catch (err) {
        console.error(
          '[record-payment] stand-sync-failed prospect=%s msg=%s',
          data.prospect_id,
          err instanceof Error ? err.message : String(err),
        );
      }
      void (async () => {
        try {
          const { syncBrevoLifecycle } = await import('@/lib/brevo/sync-lifecycle');
          await syncBrevoLifecycle(data.prospect_id);
        } catch {
          /* best-effort */
        }
      })();
    }
  }

  // 6. Audit log.
  await supabase.from('audit_log').insert({
    user_id: profile.id,
    action: 'create',
    entity_type: 'prospects',
    entity_id: data.prospect_id,
    after: {
      kind: 'manual_payment_recorded',
      payment_type: data.payment_type,
      method: data.method,
      amount_ttc: data.amount_ttc,
      reference: data.reference ?? null,
      sellsy_collection: sellsyCollection,
      sellsy_doc_id: String(documentId),
      sellsy_payment_id: sellsy.paymentId,
      status_updated: statusUpdated,
    } as never,
  });

  revalidatePath(`/admin/prospects/${data.prospect_id}`);
  return { ok: true, sellsy_payment_id: sellsy.paymentId, status_updated: statusUpdated };
}
