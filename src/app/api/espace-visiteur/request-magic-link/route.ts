/**
 * POST /api/espace-visiteur/request-magic-link — P15.3
 *
 * Demande d'un magic-link visiteur. Anti-enumeration : toujours
 * { success: true }. Rate limit 10/IP/h + 5/email/h.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit/in-memory';
import { getClientIp } from '@/lib/rate-limit/ip';
import { signVisitorMagicToken } from '@/lib/espace-visiteur/jwt';
import { findVisitorAuthByEmail, ensureVisitorAccount } from '@/lib/espace-visiteur/accounts';
import { renderEspaceVisiteurMagicLinkTemplate } from '@/lib/resend/templates/espace-visiteur-magic-link';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { capitalizeName } from '@/lib/format/name';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOG_PREFIX = '[espace-visiteur/request-magic-link]';

const inputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  locale: z.enum(['fr', 'en']).default('fr'),
});

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);

  const ipLimit = checkRateLimit({
    key: `espace-visiteur-magic:ip:${ip}`,
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
  const { email, locale } = parsed.data;

  const emailLimit = checkRateLimit({
    key: `espace-visiteur-magic:email:${email}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!emailLimit.ok) {
    return NextResponse.json(
      { success: false, error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(emailLimit.retryAfterSeconds) } },
    );
  }

  let lookup = null;
  try {
    lookup = await findVisitorAuthByEmail(email);
  } catch (err) {
    console.error('%s db-lookup-failed email=%s msg=%s', LOG_PREFIX, email, err);
  }

  if (!lookup) {
    console.log('%s no-match email=%s — generic success', LOG_PREFIX, email);
    return NextResponse.json({ success: true });
  }

  try {
    await ensureVisitorAccount(lookup.visitorId, lookup.email);
    const token = await signVisitorMagicToken(lookup.visitorId);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const magicLinkUrl = `${baseUrl}/api/espace-visiteur/login?token=${encodeURIComponent(token)}&locale=${locale}`;
    const requestPageUrl = `${baseUrl}/${locale}/espace-visiteur`;

    const tpl = renderEspaceVisiteurMagicLinkTemplate(locale, {
      firstName:
        capitalizeName(lookup.firstName ?? '') ||
        (locale === 'fr' ? 'cher visiteur' : 'dear visitor'),
      magicLinkUrl,
      requestPageUrl,
    });

    await sendTransactionalEmailViaResend({
      to: email,
      toName: lookup.firstName ?? undefined,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [
        { name: 'category', value: 'espace_visiteur_magic_link' },
        { name: 'locale', value: locale },
      ],
    });

    console.log('%s magic-link-sent visitor=%s locale=%s', LOG_PREFIX, lookup.visitorId, locale);
  } catch (err) {
    console.error('%s magic-link-send-failed visitor=%s msg=%s', LOG_PREFIX, lookup.visitorId, err);
  }

  return NextResponse.json({ success: true });
}
