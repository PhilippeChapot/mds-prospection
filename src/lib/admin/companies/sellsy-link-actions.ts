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
 * Search live dans Sellsy par nom (toujours) + optionnellement SIREN si
 * la query contient 9 chiffres. Retourne max 10 résultats normalisés
 * (SellsyClientLite). Best-effort sur erreurs Sellsy : retourne [].
 */
export async function searchSellsyClientsAction(
  input: z.input<typeof searchSchema>,
): Promise<SellsyClientLite[]> {
  await requireAdminProfile();
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return [];
  const q = parsed.data.q;

  const results: SellsyClientLite[] = [];

  // 1. Si la query ressemble à un SIREN (9 chiffres) → search SIREN d'abord.
  const sirenDigits = q.replace(/\D/g, '');
  if (sirenDigits.length === 9) {
    try {
      const res = await sellsyFetch<{ data: SellsyCompanyRow[] }>('/companies/search?limit=10', {
        method: 'POST',
        body: JSON.stringify({ filters: { siren: sirenDigits } }),
      });
      for (const c of res.data ?? []) {
        results.push({
          id: String(c.id),
          name: c.name ?? '(sans nom)',
          email: c.email ?? null,
          siren: c.siren ?? c.siret ?? null,
        });
      }
    } catch {
      // skip silencieux — V1 best-effort
    }
  }

  // 2. Search par nom (toujours, complète les SIREN matches).
  try {
    const res = await sellsyFetch<{ data: SellsyCompanyRow[] }>('/companies/search?limit=10', {
      method: 'POST',
      body: JSON.stringify({ filters: { name: q } }),
    });
    for (const c of res.data ?? []) {
      // Dedup : skip si déjà ajouté via SIREN.
      if (results.some((r) => r.id === String(c.id))) continue;
      results.push({
        id: String(c.id),
        name: c.name ?? '(sans nom)',
        email: c.email ?? null,
        siren: c.siren ?? c.siret ?? null,
      });
    }
  } catch {
    // skip silencieux
  }

  return results.slice(0, 10);
}
