/**
 * Sellsy V2 — enregistrement d'un paiement sur un devis/facture.
 *
 * Appele depuis le webhook Stripe sur checkout.session.completed +
 * payment_intent.succeeded. Best-effort : si Sellsy renvoie 4xx/5xx
 * on log mais on ne fail PAS le webhook (la maj DB MDS est plus
 * critique que la sync Sellsy).
 *
 * Quirk Sellsy V2 #24 — POST /v2/payments retourne 405 (GET only sur
 * la collection racine). Le bon flow RESTful en 2 etapes :
 *   1. POST /v2/companies/{companyId}/payments (CreatePayment schema)
 *      -> retourne { id } du paiement cree (statut "credit")
 *   2. POST /v2/invoices/{documentId}/payments/{paymentId}
 *      (LinkPaymentToDocument schema) -> attache le paiement au document
 *
 * Pre-requis env :
 *   - SELLSY_PAYMENT_METHOD_ID_STRIPE : id Sellsy du payment method
 *     "Stripe" / "Carte bancaire" (a decouvrir via GET /v2/payment-methods,
 *     puis configure cote Vercel env). Si absent -> skip + warn.
 *
 * Logs structures (prefix [sellsy/payments]).
 */

import { sellsyFetch } from '@/lib/sellsy/client';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[sellsy/payments]';

export interface NotifyPaymentInput {
  /** Pour lookup company.sellsy_id (etape 1 cree le paiement sur la company). */
  prospectId: string;
  /** Sellsy id du document a associer (estimate/invoice/proforma). */
  documentId: number;
  documentType: 'invoice' | 'estimate' | 'proforma';
  amountEur: number;
  /** Libelle libre (ex: 'stripe', 'virement', 'cheque') pour la note Sellsy. */
  paymentMethod: string;
  /**
   * P5.x.ManualPaymentRecording — id Sellsy de la methode de paiement.
   * Si absent, fallback sur SELLSY_PAYMENT_METHOD_ID_STRIPE (chemin Stripe
   * webhook historique).
   */
  paymentMethodId?: number;
  reference?: string;
  /** Date du paiement (ISO). Defaut: maintenant. */
  paidAt?: string;
  /** Note Sellsy libre. Defaut: derivee de paymentMethod + reference. */
  note?: string;
}

export async function notifySellsyPaymentReceived(
  input: NotifyPaymentInput,
): Promise<{ paymentId: number | null; error: string | null }> {
  console.log(
    '%s start prospect=%s document_id=%d type=%s amount=%d',
    LOG_PREFIX,
    input.prospectId,
    input.documentId,
    input.documentType,
    input.amountEur,
  );

  // 1. Resoudre le payment_method_id Sellsy : override explicite (paiement
  //    manuel) ou fallback env Stripe (webhook historique).
  const rawMethod = process.env.SELLSY_PAYMENT_METHOD_ID_STRIPE;
  const paymentMethodId = input.paymentMethodId ?? (rawMethod ? Number(rawMethod) : NaN);
  if (!Number.isFinite(paymentMethodId) || paymentMethodId <= 0) {
    const msg = 'payment_method_id Sellsy manquant ou invalide (SELLSY_PAYMENT_METHOD_ID_STRIPE ?)';
    console.warn('%s skip-no-payment-method-id %s', LOG_PREFIX, msg);
    return { paymentId: null, error: msg };
  }

  // 2. Lookup company.sellsy_id depuis le prospect.
  const supabase = getSupabaseServiceClient();
  const { data: prospect } = await supabase
    .from('prospects')
    .select('company:companies!inner(sellsy_id)')
    .eq('id', input.prospectId)
    .maybeSingle();
  const company = pickFirst(prospect?.company);
  const companyId = company?.sellsy_id ? Number(company.sellsy_id) : NaN;
  if (!Number.isFinite(companyId) || companyId <= 0) {
    const msg = `company.sellsy_id manquant pour prospect ${input.prospectId}`;
    console.warn('%s skip-no-company-id %s', LOG_PREFIX, msg);
    return { paymentId: null, error: msg };
  }

  // 3. Etape 1 — POST /companies/{id}/payments (CreatePayment schema).
  let paymentId: number;
  try {
    const createPayload = {
      type: 'credit' as const,
      paid_at: input.paidAt ?? new Date().toISOString(),
      payment_method_id: paymentMethodId,
      amount: { value: input.amountEur.toFixed(2), currency: 'EUR' as const },
      number: input.reference ?? `${input.paymentMethod}-${Date.now()}`,
      note: input.note ?? `${input.paymentMethod} ${input.reference ?? ''}`.trim(),
    };
    const res = await sellsyFetch<{ id?: number; data?: { id?: number } }>(
      `/companies/${companyId}/payments`,
      { method: 'POST', body: JSON.stringify(createPayload) },
    );
    const id = res.data?.id ?? res.id;
    if (typeof id !== 'number') {
      throw new Error(
        `Sellsy create-payment response sans id : ${JSON.stringify(res).slice(0, 200)}`,
      );
    }
    paymentId = id;
    console.log(
      '%s create-payment-ok payment_id=%d company_id=%d',
      LOG_PREFIX,
      paymentId,
      companyId,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s create-payment-failed prospect=%s msg=%s', LOG_PREFIX, input.prospectId, msg);
    return { paymentId: null, error: `create-payment: ${msg}` };
  }

  // 4. Etape 2 — POST /<documentEndpoint>/{docId}/payments/{paymentId}.
  const docEndpoint = endpointForDocumentType(input.documentType);
  try {
    await sellsyFetch(`/${docEndpoint}/${input.documentId}/payments/${paymentId}`, {
      method: 'POST',
      body: JSON.stringify({ amount: input.amountEur }),
    });
    console.log(
      '%s link-payment-ok payment_id=%d doc_id=%d type=%s',
      LOG_PREFIX,
      paymentId,
      input.documentId,
      input.documentType,
    );
    return { paymentId, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Le payment a ete cree mais pas attache au document. Pas critique :
    // l'admin Sellsy peut le link manuellement via le dashboard.
    console.warn(
      '%s link-payment-failed payment_id=%d doc_id=%d msg=%s — payment cree mais non lie au doc, link manuel necessaire cote Sellsy',
      LOG_PREFIX,
      paymentId,
      input.documentId,
      msg,
    );
    return { paymentId, error: `link-payment: ${msg}` };
  }
}

/**
 * Mapping documentType MDS -> endpoint Sellsy V2 (collection plurialisee).
 * Quirk #24 : proforma cote MDS = deposit-invoices cote Sellsy V2.
 */
function endpointForDocumentType(type: 'invoice' | 'estimate' | 'proforma'): string {
  switch (type) {
    case 'invoice':
      return 'invoices';
    case 'estimate':
      return 'estimates';
    case 'proforma':
      return 'deposit-invoices';
  }
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
