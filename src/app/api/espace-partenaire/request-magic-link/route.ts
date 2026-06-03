/**
 * POST /api/espace-partenaire/request-magic-link — P5.x.2
 *
 * Demande d'envoi d'un lien magic-link a l'email d'un partenaire deja
 * present en base (prospect actif). Anti-enumeration : la response est
 * toujours { success: true } meme si l'email n'a aucun match — c'est au
 * client de prendre le retour generique au pied de la lettre.
 *
 * Rate limit (in-memory, cf. limitation P5 dans rate-limit/in-memory.ts) :
 *   - 10 requetes / IP / heure
 *   - 5 requetes / email / heure
 * Les deux compteurs sont check en serie ; le premier qui throw fait
 * retomber sur 429.
 *
 * Auth : aucune — endpoint public.
 *
 * Reponses :
 *   200 { success: true }                 (toujours, anti-enum)
 *   400 { success: false, error: 'invalid_payload' }
 *   429 { success: false, error: 'rate_limited' }
 *   500 { success: false, error: 'internal_error' }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit/in-memory';
import { getClientIp } from '@/lib/rate-limit/ip';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { signContactMagicToken } from '@/lib/espace-partenaire/jwt';
import { renderEspacePartenaireMagicLinkTemplate } from '@/lib/resend/templates/espace-partenaire-magic-link';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { capitalizeName } from '@/lib/format/name';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOG_PREFIX = '[espace-partenaire/request-magic-link]';

const inputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  locale: z.enum(['fr', 'en']).default('fr'),
});

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);

  const ipLimit = checkRateLimit({
    key: `espace-partenaire-magic:ip:${ip}`,
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
    key: `espace-partenaire-magic:email:${email}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!emailLimit.ok) {
    // Note : on retourne 429 explicite ici. C'est un trade-off vs
    // l'anti-enum : si on cachait, un attaquant pourrait abuser le
    // compteur d'un email cible, mais le compteur IP a deja vu 10
    // requetes -> il est probablement deja bloque par l'IP. Ce 429
    // n'est donc visible que pour le proprietaire legitime de l'email
    // qui spam le bouton.
    return NextResponse.json(
      { success: false, error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(emailLimit.retryAfterSeconds) } },
    );
  }

  // P8.2 : lookup direct contacts par email — magic link universel.
  // Tout contact en base recoit un magic-link, peu importe s'il a un
  // prospect actif ou pas. L'anti-enumeration reste assuree (success
  // generique meme sans match).
  let contactId: string | null = null;
  let firstName = '';
  try {
    const supabase = getSupabaseServiceClient();
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (contact) {
      contactId = contact.id;
      firstName = contact.first_name ?? '';
    }
  } catch (err) {
    console.error(
      '%s db-lookup-failed email=%s msg=%s',
      LOG_PREFIX,
      email,
      err instanceof Error ? err.message : String(err),
    );
    // Continue : on retourne success generique meme si lookup KO.
  }

  if (!contactId) {
    console.log('%s no-match email=%s — return generic success', LOG_PREFIX, email);
    return NextResponse.json({ success: true });
  }

  // Genere le magic-link contact-based + envoie email via Resend.
  try {
    const token = await signContactMagicToken(contactId);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    // P5.x.2.bis : pointe vers le Route Handler `/api/espace-partenaire/login`
    // (et plus le Server Component `/[locale]/.../login/page.tsx`) car
    // Next.js 15 interdit `cookies().set()` dans un Server Component.
    // Le route handler set le cookie sur la response et redirect ensuite
    // vers `/[locale]/espace-partenaire/dashboard`.
    const magicLinkUrl = `${baseUrl}/api/espace-partenaire/login?token=${encodeURIComponent(token)}&locale=${locale}`;
    const requestPageUrl = `${baseUrl}/${locale}/espace-partenaire`;

    const tpl = renderEspacePartenaireMagicLinkTemplate(locale, {
      // P5.x.3 S1 : capitalize "phil" -> "Phil" pour l'email.
      firstName:
        capitalizeName(firstName) || (locale === 'fr' ? 'cher partenaire' : 'dear partner'),
      magicLinkUrl,
      requestPageUrl,
    });

    await sendTransactionalEmailViaResend({
      to: email,
      toName: firstName,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [
        { name: 'category', value: 'espace_partenaire_magic_link' },
        { name: 'locale', value: locale },
      ],
    });

    console.log(
      '%s magic-link-sent contact_id=%s email=%s locale=%s',
      LOG_PREFIX,
      contactId,
      email,
      locale,
    );
  } catch (err) {
    console.error(
      '%s magic-link-send-failed contact_id=%s msg=%s',
      LOG_PREFIX,
      contactId,
      err instanceof Error ? err.message : String(err),
    );
    // Toujours success generique pour ne pas leaker un fail interne.
  }

  return NextResponse.json({ success: true });
}
