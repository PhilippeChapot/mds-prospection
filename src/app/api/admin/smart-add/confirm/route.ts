/**
 * POST /api/admin/smart-add/confirm — finalise un Smart Add.
 *
 * Auth : admin/sales (delete reserved to admin in admin-actions, mais create
 * autorisé pour les deux).
 * Body : ConfirmInput (voir orchestrator.ts).
 * Réponse : { ok, companyId, contactId, brevoContactId, brevoKind, smartAddAttemptId }.
 */

import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { confirmSchema, confirmSmartAdd } from '@/lib/smart-add/orchestrator';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

const LOG_PREFIX = '[admin/smart-add/confirm]';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const profile = await requireAdminProfile();
    if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = confirmSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation' },
        { status: 400 },
      );
    }

    console.log('%s start by=%s mode=%s', LOG_PREFIX, profile.email, parsed.data.company_mode);
    const result = await confirmSmartAdd(parsed.data, profile.id);
    if (!result.ok) {
      console.warn('%s rejected msg=%s', LOG_PREFIX, result.error);
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    console.log(
      '%s done company=%s contact=%s brevo=%s',
      LOG_PREFIX,
      result.data.companyId,
      result.data.contactId,
      result.data.brevoKind,
    );

    return NextResponse.json({ ok: true, ...result.data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed msg=%s', LOG_PREFIX, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
