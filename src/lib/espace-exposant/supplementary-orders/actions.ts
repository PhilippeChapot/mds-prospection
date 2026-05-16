'use server';

/**
 * P6.x.1b — server action checkout pour commande complémentaire.
 *
 * Flow :
 *   1. Lit le cookie session espace-exposant → prospect_id
 *   2. Vérifie l'éligibilité (signed_at + status)
 *   3. Fetch les produits Sellsy (miroir) et fige le prix
 *   4. INSERT supplementary_orders en status='pending'
 *   5. Crée Stripe Checkout session avec metadata {business, flow='supplementary',
 *      supplementary_order_id, prospect_id}
 *   6. UPDATE supplementary_orders.stripe_checkout_session_id
 *   7. Retourne l'URL de redirect
 *
 * TVA V1 : 20% hardcodé (brief Notes). À raffiner V2 si besoin de tax_rate
 * spécifique par produit.
 */

import { cookies } from 'next/headers';
import { z } from 'zod';
import { ESPACE_EXPOSANT_SESSION_COOKIE, verifySessionToken } from '@/lib/espace-exposant/jwt';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getStripe } from '@/lib/stripe/client';
import { STRIPE_BUSINESS_TAG } from '@/lib/stripe/constants';
import { canAccessSupplementaryOrders } from './eligibility';
import { getProspectForExposant } from './queries';

const LOG_PREFIX = '[supplementary-orders/checkout]';

const DEFAULT_VAT_RATE = 20; // %
const MIN_ITEMS = 1;
const MAX_ITEMS = 30;
const MAX_QTY_PER_ITEM = 10;

const inputSchema = z.object({
  items: z
    .array(
      z.object({
        sellsy_product_id: z.number().int().positive(),
        qty: z.number().int().min(1).max(MAX_QTY_PER_ITEM),
      }),
    )
    .min(MIN_ITEMS)
    .max(MAX_ITEMS),
  customer_note: z.string().trim().max(2000).optional(),
});

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

interface ItemSnapshot {
  sellsy_product_id: number;
  reference: string;
  name: string;
  unit_price_ht: number;
  qty: number;
  line_total_ht: number;
}

/**
 * Crée une Stripe Checkout Session pour une commande complémentaire.
 * Le cookie session espace-exposant détermine le prospect (pas de prospect_id
 * en input client → impossible de payer pour quelqu'un d'autre).
 */
export async function createSupplementaryCheckoutSession(input: unknown): Promise<CheckoutResult> {
  // 1. Auth via cookie session
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ESPACE_EXPOSANT_SESSION_COOKIE);
  if (!sessionCookie?.value) {
    return { ok: false, error: 'Session expirée. Reconnectez-vous.' };
  }
  let prospectId: string;
  try {
    const claims = await verifySessionToken(sessionCookie.value);
    prospectId = claims.prospectId;
  } catch {
    return { ok: false, error: 'Session invalide. Reconnectez-vous.' };
  }

  // 2. Validation Zod
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation' };
  }
  const data = parsed.data;

  // 3. Éligibilité
  const prospect = await getProspectForExposant(prospectId);
  const eligibility = canAccessSupplementaryOrders(prospect);
  if (!eligibility.eligible) {
    return { ok: false, error: eligibility.reason };
  }
  if (!prospect?.contact_email) {
    return { ok: false, error: "Email de contact manquant sur votre dossier. Contactez l'équipe." };
  }

  // 4. Fetch produits Sellsy (miroir) — fige le prix maintenant
  const supabase = getSupabaseServiceClient();
  const requestedIds = data.items.map((i) => i.sellsy_product_id);
  const { data: products, error: pErr } = await supabase
    .from('sellsy_products_mirror')
    .select('sellsy_item_id, reference, name, price_excl_tax, is_archived')
    .in('sellsy_item_id', requestedIds);
  if (pErr) {
    console.error('%s products-fetch-failed msg=%s', LOG_PREFIX, pErr.message);
    return { ok: false, error: 'Erreur récupération produits.' };
  }
  const byId = new Map((products ?? []).map((p) => [Number(p.sellsy_item_id), p]));

  const items: ItemSnapshot[] = [];
  for (const requested of data.items) {
    const p = byId.get(requested.sellsy_product_id);
    if (!p || p.is_archived) {
      return {
        ok: false,
        error: `Produit ${requested.sellsy_product_id} introuvable ou archivé. Rafraîchissez la page.`,
      };
    }
    if (p.price_excl_tax == null) {
      return {
        ok: false,
        error: `Prix manquant pour ${p.reference}. Contactez l'équipe.`,
      };
    }
    const unitHt = Number(p.price_excl_tax);
    if (!Number.isFinite(unitHt) || unitHt < 0) {
      return { ok: false, error: `Prix invalide pour ${p.reference}.` };
    }
    items.push({
      sellsy_product_id: Number(p.sellsy_item_id),
      reference: p.reference,
      name: p.name ?? p.reference,
      unit_price_ht: unitHt,
      qty: requested.qty,
      line_total_ht: Math.round(unitHt * requested.qty * 100) / 100,
    });
  }

  const totalHt = Math.round(items.reduce((s, i) => s + i.line_total_ht, 0) * 100) / 100;
  const totalTtc = Math.round(totalHt * (1 + DEFAULT_VAT_RATE / 100) * 100) / 100;

  if (totalHt <= 0) {
    return { ok: false, error: 'Total nul. Au moins 1 produit > 0 € requis.' };
  }

  // 5. INSERT row pending
  const { data: order, error: insertErr } = await supabase
    .from('supplementary_orders')
    .insert({
      prospect_id: prospectId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: items as any,
      total_ht_eur: totalHt,
      total_ttc_eur: totalTtc,
      vat_rate: DEFAULT_VAT_RATE,
      customer_note: data.customer_note ?? null,
      status: 'pending',
    })
    .select('id')
    .single();
  if (insertErr || !order) {
    console.error('%s insert-failed msg=%s', LOG_PREFIX, insertErr?.message);
    return { ok: false, error: 'Erreur création commande.' };
  }

  // 6. Stripe Checkout Session
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  if (!appUrl) {
    return { ok: false, error: 'NEXT_PUBLIC_APP_URL non configuré.' };
  }
  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: prospect.contact_email,
      line_items: items.map((i) => ({
        price_data: {
          currency: 'eur',
          product_data: {
            name: i.name,
            metadata: {
              sellsy_product_id: String(i.sellsy_product_id),
              reference: i.reference,
            },
          },
          // unit_amount = TTC en centimes (TVA déjà incluse dans le prix
          // affiché TTC, Stripe ne calcule pas la TVA — automatic_tax=false)
          unit_amount: Math.round(i.unit_price_ht * (1 + DEFAULT_VAT_RATE / 100) * 100),
        },
        quantity: i.qty,
      })),
      success_url: `${appUrl}/fr/espace-exposant/dashboard/commandes/${order.id}?paid=1`,
      cancel_url: `${appUrl}/fr/espace-exposant/dashboard/commander`,
      metadata: {
        business: STRIPE_BUSINESS_TAG,
        flow: 'supplementary',
        supplementary_order_id: order.id,
        prospect_id: prospectId,
      },
      payment_intent_data: {
        metadata: {
          business: STRIPE_BUSINESS_TAG,
          flow: 'supplementary',
          supplementary_order_id: order.id,
          prospect_id: prospectId,
        },
      },
      automatic_tax: { enabled: false },
    });
  } catch (err) {
    console.error('%s stripe-create-failed msg=%s', LOG_PREFIX, err);
    // Best-effort : marque l'order comme failed (mais on garde la row pour audit)
    await supabase.from('supplementary_orders').update({ status: 'failed' }).eq('id', order.id);
    return { ok: false, error: 'Erreur Stripe. Réessayez dans quelques minutes.' };
  }

  if (!session.url) {
    return { ok: false, error: "Stripe n'a pas renvoyé d'URL." };
  }

  // 7. Save session id
  await supabase
    .from('supplementary_orders')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', order.id);

  console.log(
    '%s created order=%s session=%s total_ttc=%d prospect=%s',
    LOG_PREFIX,
    order.id,
    session.id,
    totalTtc,
    prospectId,
  );

  return { ok: true, url: session.url };
}
