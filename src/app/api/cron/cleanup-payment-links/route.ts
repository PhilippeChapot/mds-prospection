/**
 * Cron Vercel — desactivation des Payment Links Stripe acompte expires.
 *
 * P5.x.3 S3 : la migration 0031 (P5.x.2) annoncait dans son commentaire
 * que ce cron tournerait — il n'existait pas encore. C'est fait.
 *
 * Trigger : tous les jours a 4h UTC (= 6h Paris) via vercel.json. Auth
 * via header Bearer CRON_SECRET (meme env var que les autres crons).
 *
 * Logique :
 *   1. SELECT prospects ou acompte_payment_link_id IS NOT NULL AND
 *      acompte_payment_link_expires_at < now() AND acompte_paid_at IS NULL.
 *   2. Pour chaque ligne : stripe.paymentLinks.update(id, { active: false }).
 *      Tolerant aux 404 (lien deja archive cote Stripe) et autres erreurs
 *      (loggees, comptees, mais ne bloquent pas la suite).
 *   3. Retour { ok, deactivated, errors }.
 *
 * On ne supprime PAS la row prospect ni les colonnes acompte_payment_link_*
 * — l'admin garde la trace (et l'expose dans le dashboard partenaire qui
 * affichera "lien expire, contactez-nous" via paymentLinkExpired).
 *
 * Idempotent : un Payment Link deja desactive (active=false) reste tel
 * quel apres re-update. On peut donc relancer le cron sans risque.
 *
 * Logs structures (prefix [cron/cleanup-payment-links]).
 */

import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getStripe } from '@/lib/stripe/client';

const LOG_PREFIX = '[cron/cleanup-payment-links]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ExpiredRow {
  id: string;
  acompte_payment_link_id: string;
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    console.warn('%s unauthorized auth_header_present=%s', LOG_PREFIX, Boolean(auth));
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log('%s start', LOG_PREFIX);

  const supabase = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('prospects')
    .select('id, acompte_payment_link_id')
    .not('acompte_payment_link_id', 'is', null)
    .lt('acompte_payment_link_expires_at', nowIso)
    .is('acompte_paid_at', null);

  if (error) {
    console.error('%s db-error msg=%s', LOG_PREFIX, error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ExpiredRow[];
  if (rows.length === 0) {
    console.log('%s done deactivated=0 errors=0 (rien a faire)', LOG_PREFIX);
    return NextResponse.json({ ok: true, deactivated: 0, errors: 0 });
  }

  const stripe = getStripe();
  let deactivated = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      await stripe.paymentLinks.update(row.acompte_payment_link_id, { active: false });
      deactivated += 1;
      console.log(
        '%s deactivated prospect=%s plink=%s',
        LOG_PREFIX,
        row.id,
        row.acompte_payment_link_id,
      );
    } catch (err) {
      errors += 1;
      console.error(
        '%s update-failed prospect=%s plink=%s msg=%s',
        LOG_PREFIX,
        row.id,
        row.acompte_payment_link_id,
        err instanceof Error ? err.message : String(err),
      );
      // Continue : un fail n'arrete pas le batch.
    }
  }

  console.log('%s done deactivated=%d errors=%d', LOG_PREFIX, deactivated, errors);
  return NextResponse.json({ ok: true, deactivated, errors });
}
