'use server';

/**
 * P6.x.SellsyDedupClient — server actions de gestion manuelle du lien
 * companies.sellsy_id ↔ client Sellsy.
 *
 * Cas d'usage :
 *   - Phil voit qu'on a créé un doublon dans Sellsy → délier puis re-lier
 *     manuellement au "vrai" client Sellsy (raison sociale ≠ marque MDS).
 *   - Setup proactif : avant d'émettre un devis, lier manuellement pour
 *     éviter la création auto.
 *
 * RBAC : tout admin (pas super_admin only — usage fréquent).
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : ce fichier
 * 'use server' n exporte QUE des async functions.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sellsyFetch } from '@/lib/sellsy/client';

export type SellsyClientLite = {
  id: string;
  name: string;
  email: string | null;
  siren: string | null;
  // Score fuzzy (0..1) — uniquement set quand la recherche utilise le
  // matcher local (V1 = score 1.0 pour tous les résultats raw Sellsy).
  score?: number;
};

export type SellsyLinkActionResult =
  | { ok: true; sellsy_company_id?: string | null }
  | { ok: false; error: string };

// ─── Link ─────────────────────────────────────────────────────────────

const linkSchema = z.object({
  company_id: z.string().uuid(),
  sellsy_company_id: z.string().min(1).max(64),
  sellsy_company_name: z.string().trim().min(1).max(255).optional(),
});

export async function linkCompanyToSellsyClientAction(
  input: z.input<typeof linkSchema>,
): Promise<SellsyLinkActionResult> {
  const profile = await requireAdminProfile();
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServiceClient() as any;

  // Lit l'ancien sellsy_id pour le before audit.
  const { data: prev } = await supabase
    .from('companies')
    .select('sellsy_id')
    .eq('id', parsed.data.company_id)
    .maybeSingle();

  const { error } = await supabase
    .from('companies')
    .update({
      sellsy_id: parsed.data.sellsy_company_id,
      last_synced_sellsy_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.company_id);
  if (error) return { ok: false, error: error.message };

  // Audit log company-level + prospect-level (pour la timeline drawer P14.4).
  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'companies',
    entity_id: parsed.data.company_id,
    action: 'update',
    before: { sellsy_id: prev?.sellsy_id ?? null },
    after: {
      kind: 'company_sellsy_link_set',
      sellsy_id: parsed.data.sellsy_company_id,
      sellsy_name: parsed.data.sellsy_company_name ?? null,
      source: 'manual',
    },
  });

  // Aussi log côté chaque prospect lié à cette company pour que ça remonte
  // dans la timeline drawer (P14.4 filtre sur entity_type='prospects').
  const { data: linkedProspects } = await supabase
    .from('prospects')
    .select('id')
    .eq('company_id', parsed.data.company_id);
  for (const p of (linkedProspects ?? []) as Array<{ id: string }>) {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      entity_type: 'prospects',
      entity_id: p.id,
      action: 'update',
      after: {
        kind: 'company_sellsy_link_set',
        sellsy_id: parsed.data.sellsy_company_id,
        sellsy_name: parsed.data.sellsy_company_name ?? null,
      },
    });
    revalidatePath(`/admin/prospects/${p.id}`);
  }

  revalidatePath(`/admin/companies/${parsed.data.company_id}`);
  return { ok: true, sellsy_company_id: parsed.data.sellsy_company_id };
}

// ─── Unlink ───────────────────────────────────────────────────────────

const unlinkSchema = z.object({ company_id: z.string().uuid() });

export async function unlinkCompanyFromSellsyClientAction(
  input: z.input<typeof unlinkSchema>,
): Promise<SellsyLinkActionResult> {
  const profile = await requireAdminProfile();
  const parsed = unlinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServiceClient() as any;
  const { data: prev } = await supabase
    .from('companies')
    .select('sellsy_id')
    .eq('id', parsed.data.company_id)
    .maybeSingle();
  if (!prev?.sellsy_id) {
    return { ok: false, error: 'Aucun lien Sellsy à supprimer.' };
  }

  const { error } = await supabase
    .from('companies')
    .update({ sellsy_id: null })
    .eq('id', parsed.data.company_id);
  if (error) return { ok: false, error: error.message };

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'companies',
    entity_id: parsed.data.company_id,
    action: 'update',
    before: { sellsy_id: prev.sellsy_id },
    after: { kind: 'company_sellsy_link_removed', previous_sellsy_id: prev.sellsy_id },
  });

  const { data: linkedProspects } = await supabase
    .from('prospects')
    .select('id')
    .eq('company_id', parsed.data.company_id);
  for (const p of (linkedProspects ?? []) as Array<{ id: string }>) {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      entity_type: 'prospects',
      entity_id: p.id,
      action: 'update',
      after: {
        kind: 'company_sellsy_link_removed',
        previous_sellsy_id: prev.sellsy_id,
      },
    });
    revalidatePath(`/admin/prospects/${p.id}`);
  }

  revalidatePath(`/admin/companies/${parsed.data.company_id}`);
  return { ok: true, sellsy_company_id: null };
}

// ─── Search Sellsy clients (autocomplete picker) ──────────────────────

const searchSchema = z.object({ q: z.string().trim().min(2).max(120) });

type SellsyCompanyRow = {
  id: number;
  name?: string;
  email?: string | null;
  siren?: string | null;
  siret?: string | null;
};

/**
 * P6.x.SellsyDedupClient-HOTFIX2 — normalise une query (ou un nom Sellsy)
 * pour matching tolérant aux tirets/casse/espaces.
 *
 * Exemple : "Win-group" → "win group" / "Win-Group Software SAS" → "win group software sas"
 * Permet le substring match local "win group" ⊆ "win group software sas".
 */
function normalizeForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .toLowerCase()
    .replace(/[-_/.,;:]+/g, ' ') // ponctuation → espace
    .replace(/\s+/g, ' ')
    .trim();
}

function pushRow(results: SellsyClientLite[], c: SellsyCompanyRow): void {
  if (results.some((r) => r.id === String(c.id))) return;
  results.push({
    id: String(c.id),
    name: c.name ?? '(sans nom)',
    email: c.email ?? null,
    siren: c.siren ?? c.siret ?? null,
  });
}

/**
 * Search live dans Sellsy avec stratégie tolérante 3 passes :
 *   1. Si query = 9 chiffres → filters: { siren } (match exact).
 *   2. filters: { name: query } brute (cas où Sellsy accepte la query telle quelle).
 *   3. filters: { name: normalizedQuery } (sans tirets, lower) — couvre
 *      "Win-group" → match "Win-Group Software SAS" via la similarité Sellsy.
 *   4. Si toujours rien : list 200 companies + filter JS substring normalisée
 *      (fallback robuste pour les cas où Sellsy ne tolère pas les variantes).
 *
 * Retourne max 10 résultats normalisés (SellsyClientLite). Best-effort sur
 * erreurs Sellsy : retourne ce qui a été trouvé jusque-là.
 */
export async function searchSellsyClientsAction(
  input: z.input<typeof searchSchema>,
): Promise<SellsyClientLite[]> {
  await requireAdminProfile();
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return [];
  const q = parsed.data.q;
  const qNorm = normalizeForMatch(q);

  const results: SellsyClientLite[] = [];

  // ── 1. Search SIREN si query = 9 chiffres ──
  const sirenDigits = q.replace(/\D/g, '');
  if (sirenDigits.length === 9) {
    try {
      const res = await sellsyFetch<{ data: SellsyCompanyRow[] }>('/companies/search?limit=10', {
        method: 'POST',
        body: JSON.stringify({ filters: { siren: sirenDigits } }),
      });
      for (const c of res.data ?? []) pushRow(results, c);
    } catch {
      // skip
    }
  }

  // ── 2. Search par nom brut ──
  try {
    const res = await sellsyFetch<{ data: SellsyCompanyRow[] }>('/companies/search?limit=10', {
      method: 'POST',
      body: JSON.stringify({ filters: { name: q } }),
    });
    for (const c of res.data ?? []) pushRow(results, c);
  } catch {
    // skip
  }

  // ── 3. Search par nom normalisé (sans tirets) si différent de q ──
  if (qNorm !== q.toLowerCase() && results.length < 5) {
    try {
      const res = await sellsyFetch<{ data: SellsyCompanyRow[] }>('/companies/search?limit=10', {
        method: 'POST',
        body: JSON.stringify({ filters: { name: qNorm } }),
      });
      for (const c of res.data ?? []) pushRow(results, c);
    } catch {
      // skip
    }
  }

  // ── 4. Fallback list + filter JS si toujours rien ──
  // Couvre "Win-group" → "Win-Group Software SAS" si Sellsy n'a matché
  // ni la query brute ni la normalisée. On liste les 200 premières companies
  // (ordre Sellsy natif, ce qui peut louper si > 200 — mais c'est mieux que
  // "Aucun résultat" en cas d'échec total des filtres).
  if (results.length === 0) {
    try {
      const res = await sellsyFetch<{ data: SellsyCompanyRow[] }>('/companies/search?limit=200', {
        method: 'POST',
        body: JSON.stringify({ filters: {} }),
      });
      const matches = (res.data ?? []).filter((c) => {
        const nameNorm = normalizeForMatch(c.name ?? '');
        return nameNorm.includes(qNorm);
      });
      for (const c of matches) pushRow(results, c);
    } catch {
      // skip
    }
  }

  return results.slice(0, 10);
}

// ─── List All Sellsy clients (drawer "Voir tout") ─────────────────────

const listAllSchema = z.object({
  page: z.number().int().min(0).default(0),
  limit: z.number().int().min(10).max(100).default(50),
});

export type SellsyClientsPage = {
  data: SellsyClientLite[];
  has_more: boolean;
  page: number;
};

/**
 * P6.x.SellsyDedupClient-HOTFIX2 (BUG 3) — liste paginée TOUTES les
 * companies Sellsy. Permet à Phil de scroller manuellement quand la
 * search échoue (cas raison sociale très différente du nom marque).
 *
 * Pagination via offset query param Sellsy V2. Limit max 100 par page,
 * default 50.
 */
export async function listAllSellsyClientsAction(
  input: z.input<typeof listAllSchema>,
): Promise<SellsyClientsPage> {
  await requireAdminProfile();
  const parsed = listAllSchema.safeParse(input);
  if (!parsed.success) {
    return { data: [], has_more: false, page: 0 };
  }
  const { page, limit } = parsed.data;
  const offset = page * limit;

  try {
    const res = await sellsyFetch<{
      data: SellsyCompanyRow[];
      pagination?: { total?: number };
    }>(`/companies/search?limit=${limit}&offset=${offset}&order_by=name&order_direction=asc`, {
      method: 'POST',
      body: JSON.stringify({ filters: {} }),
    });
    const data: SellsyClientLite[] = [];
    for (const c of res.data ?? []) {
      data.push({
        id: String(c.id),
        name: c.name ?? '(sans nom)',
        email: c.email ?? null,
        siren: c.siren ?? c.siret ?? null,
      });
    }
    const total = res.pagination?.total ?? 0;
    const has_more = total > 0 ? offset + data.length < total : data.length === limit;
    return { data, has_more, page };
  } catch {
    return { data: [], has_more: false, page };
  }
}
