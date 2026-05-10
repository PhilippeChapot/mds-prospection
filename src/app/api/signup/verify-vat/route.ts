/**
 * POST /api/signup/verify-vat — P5.x.1
 *
 * Endpoint public appele depuis l'etape 1 du wizard d'inscription pour
 * verifier un numero de TVA intracommunautaire UE (hors FR) via VIES.
 *
 * Une verification reussie permettra au client de beneficier de
 * l'autoliquidation Art. 196 lors de l'emission du devis Sellsy
 * (mecanique deja en place dans sellsy/create-document.ts depuis P4 M7).
 *
 * Le format attendu est { country: 'DE', vatNumber: '123456789' } — le
 * prefixe pays est strippe cote client si saisi en mode unifie ('DE123…').
 *
 * Reponses :
 *   200 { ok: true,  name?, address?, fromCache }
 *   200 { ok: false, error: 'invalid_country' | 'not_valid' | 'vies_unavailable' }
 *   400 { ok: false, error: 'invalid_payload' }
 *   429 { ok: false, error: 'rate_limited' }
 *
 * Le succes (HTTP 200) couvre aussi l'invalidite "metier" (TVA refusee
 * par VIES) — c'est un retour serveur normal, le client decide quoi
 * afficher. Seules les erreurs de format (Zod) renvoient 400.
 *
 * Anti-abus : rate limit IP-based ; cache 30j cote DB (vat_verifications)
 * absorbe les retentatives.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyVatNumber, EU_COUNTRIES_NON_FR } from '@/lib/vies/verify';
import { checkRateLimit } from '@/lib/rate-limit/in-memory';
import { getClientIp } from '@/lib/rate-limit/ip';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOG_PREFIX = '[signup/verify-vat]';

const inputSchema = z.object({
  country: z.string().trim().toUpperCase().length(2),
  vatNumber: z.string().trim().min(4).max(20),
});

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);

  // 10 verifs / heure / IP — cache VIES absorbe les retentatives.
  const rl = checkRateLimit({
    key: `signup-verify-vat:${ip}`,
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSeconds) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  const { country, vatNumber } = parsed.data;

  if (!(EU_COUNTRIES_NON_FR as readonly string[]).includes(country)) {
    return NextResponse.json({ ok: false, error: 'invalid_country' }, { status: 200 });
  }

  // Strip le prefixe pays si l'utilisateur l'a saisi (DE123… vs 123…) —
  // VIES exige le countryCode separe.
  const numberOnly = vatNumber.replace(/\s/g, '').replace(new RegExp(`^${country}`, 'i'), '');

  let result;
  try {
    result = await verifyVatNumber(country, numberOnly);
  } catch (err) {
    console.error(
      '%s vies-unexpected-error country=%s msg=%s',
      LOG_PREFIX,
      country,
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({ ok: false, error: 'vies_unavailable' }, { status: 200 });
  }

  if (!result.isValid) {
    // verifyVatNumber renvoie isValid=false a la fois pour
    // "VIES a dit non-valide" et "VIES timeout/5xx" — pas de signal
    // exploitable pour distinguer cote API. On rend `not_valid`
    // generique : le client peut retenter, et si le 2e essai echoue
    // pareil c'est probablement la TVA qui n'existe pas.
    return NextResponse.json({ ok: false, error: 'not_valid' }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    name: result.name ?? null,
    address: result.address ?? null,
    fromCache: result.fromCache,
  });
}
