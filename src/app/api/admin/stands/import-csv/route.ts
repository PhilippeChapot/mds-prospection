/**
 * P6.x.2a-bis — POST /api/admin/stands/import-csv
 *
 * UPSERT massif de stands depuis un CSV. Permet à l'admin d'ajuster la
 * grille Le Nôtre via Excel/Sheets après le seed initial (numbers,
 * tailles, pôles, positions x/y/w/h pour le plan Canva P6.x.3).
 *
 * Body : text/csv (raw) avec header :
 *   number,salle,taille_m2,pole_recommended,status,position_x,position_y,position_w,position_h,notes
 *
 * Comportement :
 *   - Match par (salle, number) — clé UNIQUE de la table
 *   - Si ligne existe → UPDATE des champs fournis (sans toucher prospect_id)
 *   - Si nouvelle ligne → INSERT
 *   - status invalide → ligne rejetée + ajoutée dans `errors`
 *   - pole_recommended vide → null
 *   - Le champ prospect_id n'est jamais modifié par le CSV (cohérent avec
 *     la doctrine "1 stand = 1 prospect" gérée via l'UI dédiée)
 */

import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[admin/stands/import-csv]';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SALLE_VALUES = ['delorme', 'gabriel', 'le_notre', 'foyer', 'mezzanine', 'soufflot'] as const;
const STATUS_VALUES = ['libre', 'reserve', 'paye', 'bloque'] as const;
const POLE_VALUES = [
  'REGIES_RETAIL_MEDIA',
  'AUDIO_RADIO',
  'DIFFUSION_INFRA',
  'VIDEO_CTV',
  'OUTDOOR_DOOH',
  'DATA_ADTECH',
] as const;

const rowSchema = z.object({
  number: z.string().trim().min(1).max(40),
  salle: z.enum(SALLE_VALUES),
  taille_m2: z.coerce.number().positive().max(999),
  pole_recommended: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .pipe(z.enum(POLE_VALUES).nullable())
    .optional()
    .nullable(),
  status: z.enum(STATUS_VALUES).optional().default('libre'),
  position_x: z.coerce.number().optional().nullable(),
  position_y: z.coerce.number().optional().nullable(),
  position_w: z.coerce.number().optional().nullable(),
  position_h: z.coerce.number().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

interface UpsertRow {
  number: string;
  salle: string;
  taille_m2: number;
  pole_recommended: string | null;
  status: string;
  position_x: number | null;
  position_y: number | null;
  position_w: number | null;
  position_h: number | null;
  notes: string | null;
}

export async function POST(req: Request): Promise<NextResponse> {
  let profile;
  try {
    profile = await requireAdminProfile();
  } catch {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (profile.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden (admin only)' }, { status: 403 });
  }

  const text = await req.text();
  if (!text || text.trim().length === 0) {
    return NextResponse.json({ ok: false, error: 'CSV body vide' }, { status: 400 });
  }

  // Parse CSV — papaparse gère header row, trimming, quotes
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transform: (v) => (typeof v === 'string' ? v.trim() : v),
  });
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'CSV invalide',
        details: parsed.errors.slice(0, 5).map((e) => e.message),
      },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServiceClient();
  const errors: Array<{ row: number; message: string }> = [];
  const validRows: UpsertRow[] = [];

  parsed.data.forEach((raw, idx) => {
    const r = rowSchema.safeParse(raw);
    if (!r.success) {
      errors.push({
        row: idx + 2, // +2 = +1 (header row) +1 (1-indexed)
        message: r.error.issues[0]?.message ?? 'validation failed',
      });
      return;
    }
    validRows.push({
      number: r.data.number,
      salle: r.data.salle,
      taille_m2: r.data.taille_m2,
      pole_recommended: r.data.pole_recommended ?? null,
      status: r.data.status,
      position_x: r.data.position_x ?? null,
      position_y: r.data.position_y ?? null,
      position_w: r.data.position_w ?? null,
      position_h: r.data.position_h ?? null,
      notes: r.data.notes ?? null,
    });
  });

  if (validRows.length === 0) {
    return NextResponse.json({ ok: false, error: 'Aucune ligne valide', errors }, { status: 400 });
  }

  // UPSERT massif via on_conflict (salle, number). Postgrest passe par
  // .upsert avec onConflict. NB : on n'écrit JAMAIS prospect_id pour ne pas
  // casser les assignations en cours.
  const { data, error } = await supabase
    .from('stands')
    .upsert(validRows, { onConflict: 'salle,number', ignoreDuplicates: false })
    .select('id, salle, number');
  if (error) {
    console.error('%s upsert-failed msg=%s', LOG_PREFIX, error.message);
    return NextResponse.json({ ok: false, error: error.message, errors }, { status: 500 });
  }

  console.log(
    '%s done by=%s upserted=%d errors=%d',
    LOG_PREFIX,
    profile.email,
    data?.length ?? 0,
    errors.length,
  );

  return NextResponse.json({
    ok: true,
    upserted: data?.length ?? 0,
    errors,
  });
}
