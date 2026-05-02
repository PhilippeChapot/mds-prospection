'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { parseUploadedFile, type ParsedFile } from '@/lib/import/parse-file';
import type { Database } from '@/lib/supabase/database.types';

type CategoryTarif = Database['public']['Enums']['category_tarif'];
type PoleCode = Database['public']['Enums']['pole_code'];

const VALID_CATEGORIES = new Set<CategoryTarif>(['prs_exhibitor', 'standard', 'non_eligible']);
const VALID_POLES = new Set<PoleCode>([
  'REGIES_RETAIL_MEDIA',
  'AUDIO_RADIO',
  'DIFFUSION_INFRA',
  'VIDEO_CTV',
  'OUTDOOR_DOOH',
  'DATA_ADTECH',
  'INCONNU',
]);

const MAX_ROWS = 2000;

export async function parseImportFileAction(formData: FormData): Promise<
  | {
      ok: true;
      data: ParsedFile;
    }
  | {
      ok: false;
      error: string;
    }
> {
  await requireAdminProfile();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { ok: false, error: 'Aucun fichier fourni.' };
  }
  if (file.size === 0) {
    return { ok: false, error: 'Fichier vide.' };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: 'Fichier trop volumineux (max 5 Mo).' };
  }
  try {
    const parsed = await parseUploadedFile(file);
    if (parsed.rows.length === 0) {
      return { ok: false, error: 'Aucune ligne de donnees detectee.' };
    }
    if (parsed.rows.length > MAX_ROWS) {
      return {
        ok: false,
        error: `Trop de lignes (${parsed.rows.length}). Limite : ${MAX_ROWS} par import.`,
      };
    }
    return { ok: true, data: parsed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur lors du parsing.',
    };
  }
}

export type ExistingCompany = {
  id: string;
  name: string;
  primary_domain: string | null;
};

export async function checkDuplicateDomainsAction(
  domains: string[],
): Promise<Record<string, ExistingCompany>> {
  await requireAdminProfile();
  const cleaned = [...new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean))];
  if (cleaned.length === 0) return {};

  const supabase = await createSupabaseServerClient();
  // Postgrest IN limit ~ 1000, on chunke par sécurité.
  const out: Record<string, ExistingCompany> = {};
  const chunks = chunk(cleaned, 200);
  for (const c of chunks) {
    const { data } = await supabase
      .from('companies')
      .select('id, name, primary_domain')
      .in('primary_domain', c);
    for (const row of data ?? []) {
      if (row.primary_domain) {
        out[row.primary_domain.toLowerCase()] = {
          id: row.id,
          name: row.name,
          primary_domain: row.primary_domain,
        };
      }
    }
  }
  return out;
}

export type ImportMapping = {
  name: string;
  primary_domain?: string;
  country?: string;
  category?: string;
  pole_code?: string;
};

export type ImportRowAction = 'create' | 'update' | 'skip';

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { rowIndex: number; companyName: string; message: string }[];
};

export async function confirmImportAction(input: {
  fileName: string;
  rows: Record<string, string>[];
  mapping: ImportMapping;
  actions: ImportRowAction[];
}): Promise<ImportResult> {
  await requireAdminProfile();
  const supabase = await createSupabaseServerClient();

  if (!input.mapping.name) {
    throw new Error('Le mapping doit au moins fournir la colonne "name".');
  }
  if (input.actions.length !== input.rows.length) {
    throw new Error("Le nombre d'actions ne correspond pas au nombre de lignes.");
  }

  // Resolve pole_id par code (cache local)
  const { data: polesData } = await supabase.from('poles').select('id, code');
  const poleIdByCode = new Map<string, string>();
  for (const p of polesData ?? []) {
    poleIdByCode.set(p.code, p.id);
  }

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  // On traite en chunks pour eviter le timeout sur gros volumes.
  const tasks = input.rows.map((row, index) => ({ row, action: input.actions[index], index }));
  const chunks = chunk(tasks, 50);

  for (const c of chunks) {
    for (const { row, action, index } of c) {
      const name = (row[input.mapping.name] ?? '').trim();
      if (!name) {
        result.errors.push({ rowIndex: index, companyName: '?', message: 'Nom vide' });
        continue;
      }
      if (action === 'skip') {
        result.skipped += 1;
        continue;
      }
      const domain = input.mapping.primary_domain
        ? (row[input.mapping.primary_domain] ?? '').trim().toLowerCase() || null
        : null;
      const country = input.mapping.country
        ? (row[input.mapping.country] ?? '').trim().toUpperCase().slice(0, 2) || null
        : null;
      const category = input.mapping.category
        ? mapCategory(row[input.mapping.category])
        : 'non_eligible';
      const poleCode = input.mapping.pole_code ? mapPole(row[input.mapping.pole_code]) : 'INCONNU';
      const poleId = poleIdByCode.get(poleCode) ?? null;

      const payload = {
        name,
        name_normalized: name.toLowerCase(),
        primary_domain: domain,
        country,
        category,
        pole_id: poleId,
        pole_classified_by: 'manual' as const,
        pole_classified_at: new Date().toISOString(),
        pole_confidence: 1,
      };

      try {
        if (action === 'update' && domain) {
          const { error } = await supabase
            .from('companies')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .ilike('primary_domain', domain);
          if (error) throw error;
          result.updated += 1;
        } else {
          const { error } = await supabase.from('companies').insert(payload);
          if (error) throw error;
          result.created += 1;
        }
      } catch (err) {
        result.errors.push({
          rowIndex: index,
          companyName: name,
          message: err instanceof Error ? err.message : 'Erreur inconnue',
        });
      }
    }
  }

  revalidatePath('/admin/companies');
  return result;
}

/* ---------------------- helpers ---------------------- */

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function mapCategory(input: string | undefined): CategoryTarif {
  const v = (input ?? '').trim().toLowerCase();
  if (v.includes('prs') || v === 'prs_exhibitor') return 'prs_exhibitor';
  if (v === 'standard' || v === 'mds') return 'standard';
  if (v === 'non_eligible' || v.includes('eligib')) return 'non_eligible';
  if (VALID_CATEGORIES.has(v as CategoryTarif)) return v as CategoryTarif;
  return 'non_eligible';
}

function mapPole(input: string | undefined): PoleCode {
  const v = (input ?? '').trim().toUpperCase();
  if (VALID_POLES.has(v as PoleCode)) return v as PoleCode;
  return 'INCONNU';
}
