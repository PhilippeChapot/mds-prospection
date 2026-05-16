/**
 * P6.x.1b-β — création de facture Sellsy pour une commande complémentaire
 * (post-paiement Stripe). Distinct de `createSellsyDocument` (qui assemble
 * un devis depuis step2_payload signup) — ici on prend les rows directement
 * depuis le snapshot items du supplementary_orders.
 *
 * Pattern identique à create-document.ts :
 *   - POST /invoices
 *   - rows[] avec type='catalog', quantity/unit_amount en STRING (quirk V2 #15)
 *   - related = [{ type: 'company', id: company.sellsy_id }]
 *   - public_link_enabled: true (quirk #17 — sinon link 404)
 *   - tax_id non override → catalog item porte 20% par défaut
 *
 * Best-effort : si Sellsy fail, on log mais on ne fait pas échouer la
 * livraison du webhook (la commande reste payée, l'admin peut créer la
 * facture manuellement dans Sellsy).
 */

import { sellsyFetch } from './client';
import { formatAmount } from './create-document';

const LOG_PREFIX = '[sellsy/supplementary-facture]';

export interface SupplementaryOrderItem {
  sellsy_product_id: number;
  reference: string;
  name: string;
  unit_price_ht: number;
  qty: number;
  line_total_ht: number;
}

export interface CreateSupplementaryFactureInput {
  orderId: string;
  companysSellsyId: number;
  items: SupplementaryOrderItem[];
  /** Note libre ajoutée à la facture Sellsy (ex: référence interne MDS). */
  label?: string;
}

export interface CreateSupplementaryFactureResult {
  ok: boolean;
  facture_id?: number;
  facture_number?: string;
  facture_public_url?: string;
  error?: string;
}

interface SellsyRow {
  type: 'catalog';
  quantity: string;
  related: { id: number; type: 'product' };
  unit_amount: string;
}

/**
 * Crée une facture Sellsy pour une commande complémentaire payée.
 * Lèvera jamais — retourne `{ ok: false, error }` si Sellsy fail.
 */
export async function createSupplementaryFacture(
  input: CreateSupplementaryFactureInput,
): Promise<CreateSupplementaryFactureResult> {
  if (!input.items.length) {
    return { ok: false, error: 'Items vides' };
  }
  if (!Number.isFinite(input.companysSellsyId) || input.companysSellsyId <= 0) {
    return { ok: false, error: 'companys_sellsy_id invalide' };
  }

  // 1. Assemble rows (type=catalog avec related.product, quantity/unit_amount en STRING)
  const rows: SellsyRow[] = input.items.map((item) => ({
    type: 'catalog',
    quantity: formatAmount(item.qty), // "1.00" / "2.00"
    related: { id: Number(item.sellsy_product_id), type: 'product' },
    unit_amount: formatAmount(item.unit_price_ht),
  }));

  // 2. Payload Sellsy V2 /invoices
  const payload = {
    related: [{ type: 'company' as const, id: Number(input.companysSellsyId) }],
    rows,
    public_link_enabled: true,
    ...(input.label ? { reference: input.label } : {}),
  };

  // 3. POST /invoices — gestion d'erreur défensive
  let created: unknown;
  try {
    created = await sellsyFetch<unknown>('/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      '%s sellsy-post-failed order=%s msg=%s',
      LOG_PREFIX,
      input.orderId,
      msg.slice(0, 300),
    );
    return { ok: false, error: msg };
  }

  // 4. Extract id + number + public_url (shape Sellsy V2 : id top-level OU data.id)
  const obj = created as {
    id?: unknown;
    number?: unknown;
    public_link?: unknown;
    data?: { id?: unknown; number?: unknown; public_link?: unknown };
  };
  const id = obj.data?.id ?? obj.id;
  const number = obj.data?.number ?? obj.number;
  const publicLink = obj.data?.public_link ?? obj.public_link;

  if (typeof id !== 'number') {
    console.error(
      '%s sellsy-response-no-id order=%s response=%s',
      LOG_PREFIX,
      input.orderId,
      JSON.stringify(created).slice(0, 300),
    );
    return { ok: false, error: "Sellsy n'a pas renvoyé d'id" };
  }

  console.log(
    '%s facture-created order=%s facture_id=%d number=%s',
    LOG_PREFIX,
    input.orderId,
    id,
    typeof number === 'string' ? number : 'unknown',
  );

  return {
    ok: true,
    facture_id: id,
    facture_number: typeof number === 'string' ? number : undefined,
    facture_public_url: typeof publicLink === 'string' ? publicLink : undefined,
  };
}
