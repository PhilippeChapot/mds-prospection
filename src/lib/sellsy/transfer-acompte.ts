/**
 * Sellsy V2 — transfert des paiements du devis vers la facture.
 *
 * Quand un acompte est enregistré AVANT l'émission de la facture, il est lié
 * au devis (seul document disponible à ce moment). Cette fonction ré-attache
 * les paiements existants à la nouvelle facture via l'endpoint Sellsy V2 :
 *   POST /invoices/{invoiceId}/payments/{paymentId} { amount }
 *
 * Source des payment IDs : audit_log (after.kind = 'manual_payment_recorded').
 * Best-effort : si le re-link échoue, un warning est loggué et Phil peut
 * l'effectuer manuellement côté Sellsy. La création de la facture n'est PAS
 * mise en échec.
 *
 * Limitation : ne couvre que les paiements enregistrés via
 * recordManualPaymentAction (qui persiste les IDs Sellsy dans audit_log).
 * Les paiements Stripe (webhook) ne sont pas couverts ici — ils passent par
 * un chemin différent (checkout metadata).
 */

import { sellsyFetch } from '@/lib/sellsy/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[sellsy/transfer-acompte]';

interface AuditPaymentEntry {
  sellsy_payment_id: number;
  amount_ttc: number;
}

/**
 * Ré-attache tous les paiements manuels enregistrés pour ce prospect à la
 * nouvelle facture Sellsy. Idempotent : si le payment_id est déjà lié à
 * l'invoice, Sellsy ignore (ou retourne 4xx → loggué, non bloquant).
 */
export async function transferAcompteToInvoice(
  prospectId: string,
  invoiceId: number,
  supabase: SupabaseClient,
): Promise<void> {
  const { data: entries } = await (supabase as SupabaseClient)
    .from('audit_log')
    .select('after')
    .eq('entity_type', 'prospects')
    .eq('entity_id', prospectId)
    .filter('after->>kind', 'eq', 'manual_payment_recorded');

  const payments = parsePaymentEntries(entries ?? []);

  if (payments.length === 0) {
    console.warn(
      '%s no-entries-found prospect=%s invoice=%d — paiements non trouvés dans audit_log, vérifier manuellement côté Sellsy',
      LOG_PREFIX,
      prospectId,
      invoiceId,
    );
    return;
  }

  for (const { sellsy_payment_id, amount_ttc } of payments) {
    try {
      await sellsyFetch(`/invoices/${invoiceId}/payments/${sellsy_payment_id}`, {
        method: 'POST',
        body: JSON.stringify({ amount: amount_ttc }),
      });
      console.log(
        '%s link-ok payment=%d invoice=%d amount=%d',
        LOG_PREFIX,
        sellsy_payment_id,
        invoiceId,
        amount_ttc,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        '%s link-failed payment=%d invoice=%d msg=%s — link manuel nécessaire côté Sellsy',
        LOG_PREFIX,
        sellsy_payment_id,
        invoiceId,
        msg,
      );
    }
  }
}

function parsePaymentEntries(entries: Array<{ after: unknown }>): AuditPaymentEntry[] {
  return entries.flatMap((e) => {
    const after = e.after as Record<string, unknown> | null;
    if (!after) return [];
    const sellsy_payment_id =
      typeof after.sellsy_payment_id === 'number' ? after.sellsy_payment_id : null;
    const amount_ttc = typeof after.amount_ttc === 'number' ? after.amount_ttc : null;
    if (sellsy_payment_id === null || amount_ttc === null) return [];
    return [{ sellsy_payment_id, amount_ttc }];
  });
}
