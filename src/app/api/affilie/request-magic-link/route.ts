/**
 * POST /api/affilie/request-magic-link — P7.x.1.A
 *
 * Demande d'envoi d'un magic-link a l'email d'un affilie actif. Mirror du
 * pattern espace-exposant : anti-enumeration (toujours { success: true }),
 * rate-limit IP + email.
 *
 * Lookup : `affiliates.contact_email ilike <email>` AND `is_active=true`.
 * Si match -> envoie email Resend. Sinon -> log + return generique.
 *
 * Reponses :
 *   200 { success: true }                — toujours, anti-enum
 *   400 { success: false, error: 'invalid_payload' }
 *   429 { success: false, error: 'rate_limited' }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit/in-memory';
import { getClientIp } from '@/lib/rate-limit/ip';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { signAffilieMagicToken } from '@/lib/affilie/jwt';
import { renderAffilieMagicLinkTemplate } from '@/lib/resend/templates/affilie-magic-link';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOG_PREFIX = '[affilie/request-magic-link]';

const inputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);

  const ipLimit = checkRateLimit({
    key: `affilie-magic:ip:${ip}`,
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (!ipLimit.ok) {
    return NextResponse.json(
      { success: false, error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(ipLimit.retryAfterSeconds) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_payload' }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'invalid_payload' }, { status: 400 });
  }
  const { email } = parsed.data;

  const emailLimit = checkRateLimit({
    key: `affilie-magic:email:${email}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!emailLimit.ok) {
    return NextResponse.json(
      { success: false, error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(emailLimit.retryAfterSeconds) } },
    );
  }

  // Lookup affilie actif. Service-role : on bypass RLS, mais on n'expose
  // jamais le resultat (anti-enum) -- la response est generique.
  let affiliateId: string | null = null;
  let displayName = '';
  try {
    const supabase = getSupabaseServiceClient();
    const { data: rows } = await supabase
      .from('affiliates')
      .select('id, display_name, is_active')
      .ilike('contact_email', email)
      .limit(1);

    const row = rows?.[0];
    if (row?.is_active) {
      affiliateId = row.id;
      displayName = row.display_name ?? '';
    }
  } catch (err) {
    console.error(
      '%s db-lookup-failed email=%s msg=%s',
      LOG_PREFIX,
      email,
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!affiliateId) {
    console.log('%s no-match email=%s — return generic success', LOG_PREFIX, email);
    return NextResponse.json({ success: true });
  }

  try {
    const token = await signAffilieMagicToken(affiliateId);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const magicLinkUrl = `${baseUrl}/api/affilie/login?token=${encodeURIComponent(token)}`;
    const requestPageUrl = `${baseUrl}/affilie`;

    const tpl = renderAffilieMagicLinkTemplate({
      displayName: displayName || 'cher partenaire',
      magicLinkUrl,
      requestPageUrl,
    });

    await sendTransactionalEmailViaResend({
      to: email,
      toName: displayName || undefined,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: 'category', value: 'affilie_magic_link' }],
    });

    console.log('%s magic-link-sent affiliate_id=%s email=%s', LOG_PREFIX, affiliateId, email);
  } catch (err) {
    console.error(
      '%s magic-link-send-failed affiliate_id=%s msg=%s',
      LOG_PREFIX,
      affiliateId,
      err instanceof Error ? err.message : String(err),
    );
  }

  return NextResponse.json({ success: true });
}
