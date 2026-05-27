/**
 * P9.1 — webhook /api/webhooks/tawk-lead.
 *
 * Recoit les webhooks Tawk.to (chat visiteur, cf. migration 0062) et
 * materialise un prospect `status='lead', source='chat_visiteur'` a
 * chaque coordonnee laissee dans le chat (offline form ou transcript).
 *
 * Securite : la signature HMAC-SHA1 du body brut est validee contre
 * `app_settings.tawk_webhook_secret` (header `X-Tawk-Signature`). Si
 * le secret n'est pas configure, on refuse tous les webhooks (503) pour
 * eviter qu'un attaquant qui aurait l'URL puisse injecter des leads.
 *
 * Dedup : reutilise `findOrCreateCompanyForLanding` + `findOrCreateContactForLanding`
 * (lib/landing/lead-actions.ts) — match par name + email, COALESCE des
 * champs vides uniquement. La row prospect est creee a chaque event
 * (un visiteur peut laisser plusieurs messages a des jours differents).
 *
 * Logs : sync_logs target='tawk' (best-effort, via lib/tawk/sync-logger).
 *
 * Doctrine : ce route handler renvoie TOUJOURS 200 quand le payload est
 * accepte (meme si pas de lead exploitable) pour eviter que Tawk.to
 * re-essaie en boucle. Les vraies erreurs (signature, secret manquant)
 * renvoient 401/503 — Tawk re-essaiera, ce qui est OK temps qu'on n'a
 * pas remis le secret en place.
 */

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/admin/preferences/get-setting';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendAdminNotification } from '@/lib/resend/admin-notifier';
import {
  findOrCreateCompanyForLanding,
  findOrCreateContactForLanding,
} from '@/lib/landing/lead-actions';
import { logTawkCall, TAWK_NO_PROSPECT_UUID } from '@/lib/tawk/sync-logger';
import { extractLeadFromPayload } from '@/lib/tawk/extract-lead';
import { extractEmailDomain } from '@/lib/utils/domain';

const LOG_PREFIX = '[tawk/webhook-route]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();

  // 1. Verifier la presence du secret cote DB (sinon endpoint inactif).
  const secret = await getSetting<string>('tawk_webhook_secret', '');
  if (!secret || secret.trim().length === 0) {
    console.warn('%s secret-not-configured', LOG_PREFIX);
    return NextResponse.json(
      { error: 'Webhook not configured: tawk_webhook_secret missing.' },
      { status: 503 },
    );
  }

  // 2. Valider la signature HMAC-SHA1 du body brut (Tawk.to specification).
  const signatureHeader = req.headers.get('x-tawk-signature');
  if (!signatureHeader) {
    console.warn('%s missing-signature', LOG_PREFIX);
    return NextResponse.json({ error: 'Missing X-Tawk-Signature header' }, { status: 401 });
  }
  const expected = crypto.createHmac('sha1', secret).update(rawBody, 'utf8').digest('hex');
  // Comparaison constant-time pour eviter les timing attacks.
  const sigBuf = Buffer.from(signatureHeader, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn('%s invalid-signature', LOG_PREFIX);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 3. Parser le payload (apres signature OK).
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 4. Extraire le lead.
  const extracted = extractLeadFromPayload(payload);

  if (extracted.kind === 'skip') {
    console.log('%s event-skipped event=%s', LOG_PREFIX, extracted.event);
    return NextResponse.json({ ok: true, skipped: extracted.event });
  }

  if (extracted.kind === 'no_email') {
    console.warn('%s no-email reason=%s', LOG_PREFIX, extracted.reason);
    await logTawkCall({
      entityType: 'chat_lead',
      entityId: TAWK_NO_PROSPECT_UUID,
      operation: 'create',
      status: 'pending',
      payload,
    });
    return NextResponse.json({ ok: true, no_email: true });
  }

  const lead = extracted.lead;
  const supabase = getSupabaseServiceClient();

  try {
    // 5. Dedup company : match par domaine email (pas de website / org_name
    // explicites dans un chat). Le name fallback = domain ou "Visiteur".
    const emailDomain = extractEmailDomain(lead.email);
    const companyName = emailDomain ?? lead.name ?? 'Visiteur chat';
    const company = await findOrCreateCompanyForLanding({
      name: companyName,
      website: null,
      contactEmail: lead.email,
    });

    // 6. Contact dedupe par email (firstName/lastName best-effort split).
    const [firstName, ...rest] = (lead.name || 'Visiteur chat').split(/\s+/);
    const lastName = rest.join(' ') || '—';
    const contact = await findOrCreateContactForLanding({
      email: lead.email,
      firstName,
      lastName,
      phone: null,
      companyId: company.id,
      language: 'FR',
    });

    // 7. Saison active (helper redondant avec lead-actions mais on evite
    // l'export interne ; SELECT 1 row).
    const { data: season, error: seasonErr } = await supabase
      .from('seasons')
      .select('id')
      .eq('is_active', true)
      .maybeSingle();
    if (seasonErr || !season) {
      throw new Error(`No active season: ${seasonErr?.message ?? 'missing'}`);
    }

    // 8. Prospect lead (creation systematique : un visiteur peut chater
    // plusieurs fois, chaque session vaut une touche commerciale a tracker).
    const noteHeader = `[Lead chat visiteur Tawk.to]`;
    const pageRef = lead.pageUrl ? `\nPage : ${lead.pageUrl}` : '';
    const noteBody = lead.message ? `\n\nMessage :\n${lead.message}` : '';
    const notes = `${noteHeader}${pageRef}${noteBody}`;
    const { data: prospect, error: prospectErr } = await supabase
      .from('prospects')
      .insert({
        season_id: season.id,
        company_id: company.id,
        primary_contact_id: contact.id,
        status: 'lead',
        source: 'chat_visiteur',
        source_detail: lead.pageUrl ?? lead.externalId ?? null,
        notes,
        is_test: false,
      })
      .select('id')
      .single();
    if (prospectErr || !prospect) {
      throw new Error(`Insert prospect failed: ${prospectErr?.message ?? 'unknown'}`);
    }

    console.log(
      '%s lead-created prospect=%s company=%s contact=%s email=%s',
      LOG_PREFIX,
      prospect.id,
      company.id,
      contact.id,
      lead.email,
    );

    // 9. Notif admin (best-effort).
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
      const prospectUrl = `${appUrl}/admin/prospects/${prospect.id}`;
      const subject = `[MDS] Nouveau lead chat : ${lead.name}`;
      const text = [
        'Nouveau message capture via le chat visiteur Tawk.to.',
        '',
        `Nom    : ${lead.name}`,
        `Email  : ${lead.email}`,
        lead.pageUrl ? `Page   : ${lead.pageUrl}` : null,
        '',
        'Message :',
        lead.message || '(vide)',
        '',
        `Fiche prospect : ${prospectUrl}`,
      ]
        .filter((l) => l !== null)
        .join('\n');
      const html = `
        <h2>Nouveau lead chat visiteur</h2>
        <p><strong>Nom :</strong> ${escapeHtml(lead.name)}<br/>
        <strong>Email :</strong> <a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a>
        ${lead.pageUrl ? `<br/><strong>Page :</strong> ${escapeHtml(lead.pageUrl)}` : ''}</p>
        ${lead.message ? `<h3>Message</h3><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(lead.message)}</pre>` : '<p><em>(pas de message)</em></p>'}
        <p><a href="${prospectUrl}">Voir la fiche prospect</a></p>
      `.trim();
      await sendAdminNotification('admin_chat_lead', { subject, html, text });
    } catch (err) {
      console.warn(
        '%s admin-notif-failed prospect=%s msg=%s',
        LOG_PREFIX,
        prospect.id,
        err instanceof Error ? err.message : String(err),
      );
    }

    // 10. Log success.
    await logTawkCall({
      entityType: 'prospects',
      entityId: prospect.id,
      operation: 'create',
      status: 'success',
      payload: { event: (payload as { event?: string }).event, email: lead.email },
    });

    return NextResponse.json({ ok: true, prospect_id: prospect.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s handler-failed msg=%s', LOG_PREFIX, msg);
    await logTawkCall({
      entityType: 'chat_lead',
      entityId: TAWK_NO_PROSPECT_UUID,
      operation: 'create',
      status: 'error',
      errorMessage: msg,
      payload,
    });
    // 200 pour eviter une retry storm Tawk : on a deja persiste l'erreur.
    return NextResponse.json({ ok: false, error: msg });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
