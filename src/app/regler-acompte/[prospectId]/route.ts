/**
 * GET /regler-acompte/[prospectId] — proxy de redirection paiement acompte.
 *
 * Incident 2026-07-08 (Fabrice GAUTHIER / Broadcast-Associés, D-20260624-02717) :
 * un lien de paiement colle en dur dans un email/relance a fini par 404.
 * Root cause de CET incident precis : le devis Sellsy avait ete repasse en
 * `status=draft` + `public_link_enabled=false` cote Sellsy (edition manuelle
 * post-envoi) — pas un bug de ce repo (ce prospect a payment_path=null,
 * aucun Payment Link Stripe n'a jamais ete cree par notre systeme).
 *
 * Cette route reste une protection utile pour tous les futurs prospects
 * qui, eux, passent par le flow Stripe automatise
 * (payment_path='devis_acompte_stripe') : au lieu d'emailer une URL Stripe
 * figee (qui peut etre desactivee par le cron cleanup-payment-links apres
 * `acompte_payment_link_expires_at`), on emaile CETTE route stable, qui :
 *   1. Sert le lien Stripe en cache s'il est encore valide.
 *   2. Regenere un Payment Link frais a la volee sinon (jamais de lien mort).
 *   3. Redirige toujours vers une page connue (jamais de 404 brute) —
 *      meme pattern que /i/[companyId].
 *
 * Les prospects hors flow Stripe (SEPA, proforma, facture integrale, ou
 * lead qualifie Case B avec payment_path=null) sont rediriges vers la
 * home — le paiement de ces devis est gere manuellement par Phil (Sellsy),
 * un bouton "Regler l'acompte par carte" n'a pas de sens pour eux.
 *
 * Logs structures (prefix [regler-acompte/redirect]) pour audit Vercel.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[regler-acompte/redirect]';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
const FALLBACK_URL = `${APP_URL}/fr`;

interface RouteParams {
  params: Promise<{ prospectId: string }>;
}

interface ProspectRow {
  id: string;
  is_test: boolean;
  payment_path: string | null;
  acompte_status: string;
  acompte_payment_link_url: string | null;
  acompte_payment_link_expires_at: string | null;
  sellsy_devis_total_ttc: number | null;
  sellsy_devis_number: string | null;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { prospectId } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: prospectRaw } = await supabase
    .from('prospects')
    .select(
      'id, is_test, payment_path, acompte_status, acompte_payment_link_url, acompte_payment_link_expires_at, sellsy_devis_total_ttc, sellsy_devis_number',
    )
    .eq('id', prospectId)
    .maybeSingle();
  const prospect = prospectRaw as ProspectRow | null;

  if (!prospect) {
    console.warn('%s prospect-not-found id=%s', LOG_PREFIX, prospectId);
    return redirectGracious();
  }

  if (prospect.acompte_status === 'paid') {
    console.log('%s already-paid id=%s', LOG_PREFIX, prospectId);
    return redirectGracious();
  }

  if (prospect.is_test) {
    console.log('%s is-test id=%s', LOG_PREFIX, prospectId);
    return redirectGracious();
  }

  // Seul le flow Stripe auto passe par ce proxy — les autres payment_path
  // (devis_sepa, proforma_acompte, facture_integrale) et les prospects
  // sans payment_path (lead Case B, cf. incident Broadcast-Associés) sont
  // geres manuellement par Phil, pas de Payment Link Stripe a servir ici.
  if (prospect.payment_path !== 'devis_acompte_stripe') {
    console.warn(
      '%s wrong-payment-path id=%s payment_path=%s',
      LOG_PREFIX,
      prospectId,
      prospect.payment_path ?? 'null',
    );
    return redirectGracious();
  }

  const linkStillValid =
    Boolean(prospect.acompte_payment_link_url) &&
    Boolean(prospect.acompte_payment_link_expires_at) &&
    new Date(prospect.acompte_payment_link_expires_at as string).getTime() > Date.now();

  if (linkStillValid) {
    console.log('%s redirect-cached id=%s', LOG_PREFIX, prospectId);
    return NextResponse.redirect(prospect.acompte_payment_link_url as string, { status: 302 });
  }

  // Lien absent ou expire (desactive par le cron cleanup-payment-links) ->
  // on en regenere un frais a la volee plutot que de laisser un lien mort.
  if (!prospect.sellsy_devis_total_ttc || prospect.sellsy_devis_total_ttc <= 0) {
    console.error('%s no-amount-cannot-regenerate id=%s', LOG_PREFIX, prospectId);
    return redirectGracious();
  }

  try {
    const { createAcomptePaymentLink } = await import('@/lib/stripe/payment-link');
    const acompteTtc = Math.round(prospect.sellsy_devis_total_ttc * 0.3 * 100) / 100;
    const result = await createAcomptePaymentLink({
      prospectId: prospect.id,
      amountEurTtc: acompteTtc,
      devisNumber: prospect.sellsy_devis_number,
    });
    if ('skipped' in result) {
      console.warn('%s regenerate-skipped id=%s reason=%s', LOG_PREFIX, prospectId, result.skipped);
      return redirectGracious();
    }
    console.log(
      '%s redirect-regenerated id=%s link_id=%s',
      LOG_PREFIX,
      prospectId,
      result.paymentLinkId,
    );
    return NextResponse.redirect(result.url, { status: 302 });
  } catch (err) {
    console.error(
      '%s regenerate-failed id=%s msg=%s',
      LOG_PREFIX,
      prospectId,
      err instanceof Error ? err.message : String(err),
    );
    return redirectGracious();
  }
}

function redirectGracious(): NextResponse {
  return NextResponse.redirect(FALLBACK_URL, { status: 302 });
}
