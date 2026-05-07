/**
 * Sellsy V2 — enregistrement d'un paiement sur un devis/facture.
 *
 * Appele depuis le webhook Stripe sur checkout.session.completed +
 * payment_intent.succeeded. Best-effort : si Sellsy renvoie 4xx/5xx
 * on log mais on ne fail PAS le webhook (la maj DB MDS est plus
 * critique que la sync Sellsy).
 *
 * Note Sellsy V2 : la shape exacte de POST /payments n'est pas confirmee
 * par curl en prod. On code la version "documented" en attendant — un
 * curl de validation manuel suivra avant le 1er paiement live.
 *
 * Logs structures (prefix [sellsy/payments]).
 */

import { sellsyFetch } from '@/lib/sellsy/client';

const LOG_PREFIX = '[sellsy/payments]';

export interface NotifyPaymentInput {
  documentId: number;
  documentType: 'invoice' | 'estimate';
  amountEur: number;
  paymentMethod: 'stripe';
  reference?: string;
}

export async function notifySellsyPaymentReceived(
  input: NotifyPaymentInput,
): Promise<{ paymentId: number | null; error: string | null }> {
  console.log(
    '%s start document_id=%d amount=%d method=%s',
    LOG_PREFIX,
    input.documentId,
    input.amountEur,
    input.paymentMethod,
  );

  try {
    const payload = {
      amount: input.amountEur.toFixed(2),
      payment_method_id: null,
      payment_date: new Date().toISOString().slice(0, 10),
      reference: input.reference ?? `stripe-${Date.now()}`,
      related: [{ type: input.documentType, id: input.documentId }],
    };

    const res = await sellsyFetch<{ id?: number; data?: { id?: number } }>('/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const id = res.data?.id ?? res.id ?? null;
    console.log('%s success document_id=%d payment_id=%s', LOG_PREFIX, input.documentId, id);
    return { paymentId: id, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed document_id=%d msg=%s', LOG_PREFIX, input.documentId, msg);
    return { paymentId: null, error: msg };
  }
}
