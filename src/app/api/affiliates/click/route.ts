/**
 * POST /api/affiliates/click — P5.x.7
 *
 * Track un clic affilie + set le cookie `mds_affiliate_ref` 30j.
 *
 * Appele depuis la layout publique du wizard quand `?ref=<token>` est
 * present dans l'URL. Volontairement public (pas d'auth) pour pouvoir
 * intercepter le 1er hit avant que l'utilisateur n'interagisse.
 *
 * Body : { token: string, referrer?: string, utm_source?, utm_medium?,
 *          utm_campaign? }
 *
 * Reponses :
 *   200 { ok: true }                   — token connu, click logge + cookie pose
 *   200 { ok: false, reason: 'unknown' } — token inconnu, on ne leak pas (200)
 *
 * Anti-abus : rate-limit 30/h/IP — un bot scanner peut ping ce endpoint
 * mais comme on ne log que sur token valide, le cout DB reste faible.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { checkRateLimit } from '@/lib/rate-limit/in-memory';
import { getClientIp } from '@/lib/rate-limit/ip';
import {
  AFFILIATE_COOKIE,
  AFFILIATE_COOKIE_MAX_AGE_SECONDS,
  isValidAffiliateToken,
} from '@/lib/affiliates/cookie';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOG_PREFIX = '[api/affiliates/click]';

const inputSchema = z.object({
  token: z.string().trim(),
  referrer: z.string().trim().max(500).nullable().optional(),
  utmSource: z.string().trim().max(120).nullable().optional(),
  utmMedium: z.string().trim().max(120).nullable().optional(),
  utmCampaign: z.string().trim().max(120).nullable().optional(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const ua = request.headers.get('user-agent');

  const rl = checkRateLimit({
    key: `affiliate-click:${ip}`,
    limit: 30,
    windowSeconds: 60 * 60,
  });
  if (!rl.ok) {
    // Pas de leak : on retourne 200 ok=false pour ne pas reveler la regle.
    return NextResponse.json({ ok: false, reason: 'rate_limited' }, { status: 200 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_payload' }, { status: 200 });
  }

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success || !isValidAffiliateToken(parsed.data.token)) {
    return NextResponse.json({ ok: false, reason: 'invalid_payload' }, { status: 200 });
  }

  const { token } = parsed.data;
  const supabase = getSupabaseServiceClient();
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, is_active')
    .eq('token', token)
    .maybeSingle();

  if (!affiliate || !affiliate.is_active) {
    console.log('%s unknown-or-inactive token=%s ip=%s', LOG_PREFIX, token, ip);
    // Pas de leak : on retourne 200 ok=false pour permettre au client
    // de ne pas poser le cookie si le token est inconnu.
    return NextResponse.json({ ok: false, reason: 'unknown' }, { status: 200 });
  }

  // Log du click — best-effort, n'echoue pas le response.
  try {
    await supabase.from('affiliate_clicks').insert({
      affiliate_id: affiliate.id,
      ip_address: ip === 'unknown' ? null : ip,
      user_agent: ua,
      referrer: parsed.data.referrer ?? null,
      utm_source: parsed.data.utmSource ?? null,
      utm_medium: parsed.data.utmMedium ?? null,
      utm_campaign: parsed.data.utmCampaign ?? null,
    });
  } catch (err) {
    console.warn(
      '%s click-log-failed token=%s msg=%s',
      LOG_PREFIX,
      token,
      err instanceof Error ? err.message : String(err),
    );
  }

  console.log('%s logged token=%s affiliate_id=%s', LOG_PREFIX, token, affiliate.id);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AFFILIATE_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AFFILIATE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
