/**
 * P6.x.1b-δ — admin debug endpoint pour simuler le paiement d'une commande
 * complémentaire.
 *
 * Reproduit strictement la logique du webhook Stripe (même `processPaidSupplementaryOrder`)
 * pour permettre des tests E2E sans devoir déclencher un vrai paiement Stripe.
 *
 * Protégé admin-only (role='admin'). Pas accessible aux 'sales' — c'est un
 * outil de debug, pas de gestion commerciale.
 *
 * Effet sur is_test=true : facture/email-client/Brevo skippés (gate γ
 * préservée — c'est tout l'intérêt de ce flow pour la prod).
 */

import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { processPaidSupplementaryOrder } from '@/lib/espace-partenaire/supplementary-orders/webhook-handler';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

const LOG_PREFIX = '[admin/debug/supplementary/simulate-paid]';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  let profile;
  try {
    profile = await requireAdminProfile();
  } catch {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAdminAccess(profile.role)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const supabase = getSupabaseServiceClient();
  const { data: order, error } = await supabase
    .from('supplementary_orders')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('%s db-error order=%s msg=%s', LOG_PREFIX, id, error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }
  if (order.status !== 'pending') {
    return NextResponse.json(
      { ok: false, error: 'not pending', current_status: order.status },
      { status: 400 },
    );
  }

  const simulatedPi = `pi_simulated_${crypto.randomUUID()}`;
  console.log(
    '%s start order=%s admin=%s simulated_pi=%s',
    LOG_PREFIX,
    id,
    profile.email,
    simulatedPi,
  );
  const result = await processPaidSupplementaryOrder(id, {
    stripePaymentIntentId: simulatedPi,
    stripeSessionId: null,
  });
  console.log(
    '%s done order=%s status=%s facture=%s',
    LOG_PREFIX,
    id,
    result.status,
    result.sellsy_facture_id ?? '-',
  );

  return NextResponse.json({
    ok: true,
    order_id: result.order_id,
    status: result.status,
    sellsy_facture_id: result.sellsy_facture_id,
    sellsy_facture_number: result.sellsy_facture_number,
    side_effects: {
      facture_skipped: result.side_effects.facture_skipped,
      facture_skipped_reason: result.side_effects.facture_skipped_reason,
      email_client_skipped: result.side_effects.email_client_skipped,
      email_client_skipped_reason: result.side_effects.email_client_skipped_reason,
      admin_email_test_prefix: result.side_effects.admin_email_test_prefix,
      brevo_skipped: result.side_effects.brevo_skipped,
      brevo_skipped_reason: result.side_effects.brevo_skipped_reason,
    },
  });
}
