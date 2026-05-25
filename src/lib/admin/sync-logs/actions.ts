'use server';

/**
 * P4.x.1 — Server actions admin pour /admin/sync-logs.
 *
 * Wrappers avec auth admin par-dessus les queries pures. Utilisé par
 * `<SyncLogDetailSheet>` côté client pour ouvrir un Sheet sur clic.
 *
 * La page Server Component appelle directement les queries pour la liste
 * + KPIs (pas besoin de "use server" pour SSR).
 */

import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { getSyncLogDetail, type SyncLogRow } from './queries';

const detailSchema = z.object({ id: z.string().uuid() });

export type GetSyncLogDetailResult = { ok: true; data: SyncLogRow } | { ok: false; error: string };

export async function getSyncLogDetailAction(input: {
  id: string;
}): Promise<GetSyncLogDetailResult> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    return { ok: false, error: 'Réservé aux admins.' };
  }
  const parsed = detailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid id' };
  }
  const row = await getSyncLogDetail(parsed.data.id);
  if (!row) return { ok: false, error: 'Log introuvable.' };
  return { ok: true, data: row };
}
