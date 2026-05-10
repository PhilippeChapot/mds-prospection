/**
 * Helper Stripe Payment Link — mode "concierge admin".
 *
 * Phil veut envoyer un lien de paiement custom a un prospect (ex: tarif
 * negocie). Pas de wizard automatique : l'admin renseigne montant +
 * description + duree de validite via une dialog.
 *
 * Stripe ne supporte pas nativement un expires_at sur les payment links.
 * On stocke la date d'expiration en DB (cron M5 desactivera les liens
 * expires via stripe.paymentLinks.update({ active: false })).
 *
 * Logs structures (prefix [stripe/payment-link]).
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getStripe } from './client';
import { STRIPE_BUSINESS_TAG } from './constants';

const LOG_PREFIX = '[stripe/payment-link]';

export interface CreatePaymentLinkInput {
  prospectId: string;
  amountEurHt: number;
  description: string;
  expiresInDays: 1 | 7 | 30;
}

export interface PaymentLinkResult {
  paymentLinkId: string;
  url: string;
  expiresAt: string;
  amountCents: number;
}

export async function createConciergePaymentLink(
  input: CreatePaymentLinkInput,
): Promise<PaymentLinkResult> {
  console.log(
    '%s start prospect_id=%s amount=%d desc=%s expires_in=%d',
    LOG_PREFIX,
    input.prospectId,
    input.amountEurHt,
    input.description,
    input.expiresInDays,
  );

  if (input.amountEurHt <= 0) {
    throw new Error('Montant doit etre > 0');
  }
  if (!input.description.trim()) {
    throw new Error('Description requise');
  }

  const supabase = getSupabaseServiceClient();
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select('id, is_test, sellsy_devis_id, notes')
    .eq('id', input.prospectId)
    .maybeSingle();
  if (error || !prospect) {
    throw new Error(`prospect ${input.prospectId} introuvable`);
  }
  if (prospect.is_test) {
    throw new Error('Mode TEST : creation Payment Link desactivee');
  }

  // Stripe attend des centimes. On encaisse le HT direct (Phil decide
  // si la TVA est integree dans le montant qu'il saisit dans la dialog).
  const amountCents = Math.round(input.amountEurHt * 100);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const successUrl = `${baseUrl}/fr/merci?stripe_link=${input.prospectId}`;

  const stripe = getStripe();
  const link = await stripe.paymentLinks.create({
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          product_data: { name: input.description.slice(0, 250) },
          unit_amount: amountCents,
        },
      },
    ],
    metadata: {
      prospect_id: input.prospectId,
      sellsy_document_id: prospect.sellsy_devis_id ?? '',
      source: 'admin_concierge',
      // P4.x.1 Bug B : flow=concierge -> webhook route le template
      // admin_concierge_paye au lieu de admin_acompte_paye.
      flow: 'concierge',
      // P4.x.5 : tag pour filtrer MDS dans le compte Stripe partage.
      business: STRIPE_BUSINESS_TAG,
    },
    payment_intent_data: {
      metadata: {
        prospect_id: input.prospectId,
        sellsy_document_id: prospect.sellsy_devis_id ?? '',
        source: 'admin_concierge',
        flow: 'concierge',
        business: STRIPE_BUSINESS_TAG,
      },
    },
    after_completion: { type: 'redirect', redirect: { url: successUrl } },
    restrictions: { completed_sessions: { limit: 1 } },
    inactive_message: 'Ce lien a expiré. Merci de nous contacter pour un nouveau lien de paiement.',
  });

  // Stripe ne supporte pas un expires_at natif. On le stocke en DB pour
  // le cron M5 qui desactivera les liens via paymentLinks.update active=false.
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 3600 * 1000).toISOString();

  // Append l'URL aux notes du prospect (audit trail visible cote admin).
  const noteLine = `[${new Date().toISOString().slice(0, 10)}] Payment Link Stripe (expire ${expiresAt.slice(0, 10)}) : ${link.url}`;
  const newNotes = prospect.notes ? `${prospect.notes}\n${noteLine}` : noteLine;
  await supabase.from('prospects').update({ notes: newNotes }).eq('id', input.prospectId);

  console.log(
    '%s success prospect_id=%s link_id=%s url=%s amount_cents=%d',
    LOG_PREFIX,
    input.prospectId,
    link.id,
    link.url,
    amountCents,
  );

  return {
    paymentLinkId: link.id,
    url: link.url,
    expiresAt,
    amountCents,
  };
}

/**
 * P4.x.2 sujet D — auto-creation Payment Link Stripe pour acompte 30%
 * declenche apres emission devis Sellsy quand payment_path=devis_acompte_stripe.
 *
 * Diff vs createConciergePaymentLink :
 *   - metadata.flow='acompte' (au lieu de 'concierge')
 *   - metadata.expected_pct=30 pour audit
 *   - description auto-generee ("Acompte 30% — Devis D-XXX")
 *   - amountEurTtc passe en input direct (deja calcule par le caller =
 *     30% du devis TTC, arrondi 2 decimales)
 *   - TTL 30 jours par defaut
 *   - skip si is_test=true (best-effort, pas d'exception)
 */
export interface CreateAcomptePaymentLinkInput {
  prospectId: string;
  /** Montant TTC a encaisser en EUR (deja calcule = 30% devis TTC). */
  amountEurTtc: number;
  /** Numero du devis Sellsy pour la description ("Acompte 30% — D-XXX"). */
  devisNumber: string | null;
  expiresInDays?: 1 | 7 | 30;
}

export async function createAcomptePaymentLink(
  input: CreateAcomptePaymentLinkInput,
): Promise<PaymentLinkResult | { skipped: 'is_test' | 'invalid_amount' }> {
  console.log(
    '%s acompte-start prospect_id=%s amount_ttc=%d devis=%s',
    LOG_PREFIX,
    input.prospectId,
    input.amountEurTtc,
    input.devisNumber ?? '?',
  );

  if (input.amountEurTtc <= 0) {
    console.warn('%s acompte-skip-invalid-amount prospect=%s', LOG_PREFIX, input.prospectId);
    return { skipped: 'invalid_amount' };
  }

  const supabase = getSupabaseServiceClient();
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select('id, is_test, sellsy_devis_id, notes')
    .eq('id', input.prospectId)
    .maybeSingle();
  if (error || !prospect) {
    throw new Error(`prospect ${input.prospectId} introuvable`);
  }
  if (prospect.is_test) {
    console.log('%s acompte-skip-is-test prospect=%s', LOG_PREFIX, input.prospectId);
    return { skipped: 'is_test' };
  }

  const amountCents = Math.round(input.amountEurTtc * 100);
  const expiresInDays = input.expiresInDays ?? 30;
  const description = input.devisNumber
    ? `Acompte 30% — Devis ${input.devisNumber}`
    : 'Acompte 30% — MediaDays Solutions 2026';

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const successUrl = `${baseUrl}/fr/merci?stripe_link=${input.prospectId}`;

  const stripe = getStripe();
  const link = await stripe.paymentLinks.create({
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          product_data: { name: description.slice(0, 250) },
          unit_amount: amountCents,
        },
      },
    ],
    metadata: {
      prospect_id: input.prospectId,
      sellsy_document_id: prospect.sellsy_devis_id ?? '',
      flow: 'acompte',
      expected_pct: '30',
      source: 'auto_emit_devis',
      // P4.x.5 : tag pour filtrer MDS dans le compte Stripe partage.
      business: STRIPE_BUSINESS_TAG,
    },
    payment_intent_data: {
      metadata: {
        prospect_id: input.prospectId,
        sellsy_document_id: prospect.sellsy_devis_id ?? '',
        flow: 'acompte',
        expected_pct: '30',
        business: STRIPE_BUSINESS_TAG,
      },
    },
    after_completion: { type: 'redirect', redirect: { url: successUrl } },
    restrictions: { completed_sessions: { limit: 1 } },
    inactive_message: 'Ce lien a expiré. Merci de nous contacter pour un nouveau lien de paiement.',
  });

  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 3600 * 1000).toISOString();

  // Trace dans les notes prospect (audit trail). Ligne distincte vs concierge.
  const noteLine = `[${new Date().toISOString().slice(0, 10)}] Payment Link Stripe ACOMPTE 30% (auto, expire ${expiresAt.slice(0, 10)}) : ${link.url}`;
  const newNotes = prospect.notes ? `${prospect.notes}\n${noteLine}` : noteLine;
  await supabase.from('prospects').update({ notes: newNotes }).eq('id', input.prospectId);

  console.log(
    '%s acompte-success prospect_id=%s link_id=%s url=%s amount_cents=%d',
    LOG_PREFIX,
    input.prospectId,
    link.id,
    link.url,
    amountCents,
  );

  return {
    paymentLinkId: link.id,
    url: link.url,
    expiresAt,
    amountCents,
  };
}
