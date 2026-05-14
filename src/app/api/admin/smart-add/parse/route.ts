/**
 * POST /api/admin/smart-add/parse — extrait via IA + fuzzy match + INSEE.
 *
 * Auth : session admin/sales.
 * Body : { rawInput: string } (max 50k chars)
 * Réponse : ParseResult (voir orchestrator.ts).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { parseSmartAddInput } from '@/lib/smart-add/orchestrator';

const LOG_PREFIX = '[admin/smart-add/parse]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  rawInput: z.string().min(1).max(50000),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const profile = await requireAdminProfile();
    if (profile.role !== 'admin' && profile.role !== 'sales') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation' },
        { status: 400 },
      );
    }

    console.log('%s start by=%s chars=%d', LOG_PREFIX, profile.email, parsed.data.rawInput.length);
    const result = await parseSmartAddInput(parsed.data.rawInput);
    console.log(
      '%s done parsed=%s fuzzy=%d siren=%s',
      LOG_PREFIX,
      result.parsed ? 'yes' : 'no',
      result.fuzzyMatches.length,
      result.sirenMatch?.auto
        ? `auto:${result.sirenMatch.siren}`
        : result.sirenMatch?.ambiguous
          ? `ambiguous:${result.sirenMatch.candidates.length}`
          : 'none',
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed msg=%s', LOG_PREFIX, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
