'use server';

/**
 * P12.x.EmailIntegration — actions admin : resync manuel, test connexion,
 * flags (read/star/archive), création de compte. RBAC admin + ownership.
 * Note 'use server' : seules des fonctions async exportées.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { type SupabaseClient } from '@supabase/supabase-js';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { syncEmailAccount } from '@/lib/email/imap-sync';
import { resolveAccountConfig } from '@/lib/email/account-config';
import { testEmailAccountConnection, type ConnectionTestResult } from '@/lib/email/test-connection';
import type { EmailAccountRow } from '@/lib/email/types';

const asAnyDb = (c: ReturnType<typeof getSupabaseServiceClient>): SupabaseClient =>
  c as unknown as SupabaseClient;

type Res = { ok: true } | { ok: false; error: string };

/** Vérifie qu'un compte appartient à l'admin connecté. Renvoie la row ou null. */
async function ownedAccount(
  db: SupabaseClient,
  accountId: string,
  userId: string,
): Promise<EmailAccountRow | null> {
  const { data } = await db.from('email_accounts').select('*').eq('id', accountId).maybeSingle();
  const acc = data as EmailAccountRow | null;
  if (!acc || acc.user_id !== userId) return null;
  return acc;
}

export async function resyncEmailAccountAction(
  accountId: string,
): Promise<{ ok: true; fetched: number; inserted: number } | { ok: false; error: string }> {
  const profile = await requireAdminProfile();
  const db = asAnyDb(getSupabaseServiceClient());
  const acc = await ownedAccount(db, accountId, profile.id);
  if (!acc) return { ok: false, error: 'Compte introuvable ou non autorisé.' };
  const r = await syncEmailAccount(db, accountId);
  revalidatePath('/admin/emails');
  revalidatePath('/admin/settings/email-accounts');
  if (!r.ok) return { ok: false, error: r.error ?? 'Sync échouée' };
  return { ok: true, fetched: r.fetched, inserted: r.inserted };
}

export async function testEmailAccountAction(
  accountId: string,
): Promise<{ ok: true; result: ConnectionTestResult } | { ok: false; error: string }> {
  const profile = await requireAdminProfile();
  const db = asAnyDb(getSupabaseServiceClient());
  const acc = await ownedAccount(db, accountId, profile.id);
  if (!acc) return { ok: false, error: 'Compte introuvable ou non autorisé.' };
  const config = resolveAccountConfig(acc);
  if (!config) return { ok: false, error: 'Credentials env manquantes pour ce compte.' };
  const result = await testEmailAccountConnection(config);
  return { ok: true, result };
}

const flagSchema = z.object({
  email_id: z.string().uuid(),
  field: z.enum(['is_read', 'is_starred', 'is_archived']),
  value: z.boolean(),
});

export async function setEmailFlagAction(input: z.input<typeof flagSchema>): Promise<Res> {
  const profile = await requireAdminProfile();
  const parsed = flagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Paramètres invalides' };
  const db = asAnyDb(getSupabaseServiceClient());

  // Ownership via le compte de l'email.
  const { data: email } = await db
    .from('emails')
    .select('id, account_id')
    .eq('id', parsed.data.email_id)
    .maybeSingle();
  if (!email) return { ok: false, error: 'Email introuvable.' };
  const acc = await ownedAccount(db, (email as { account_id: string }).account_id, profile.id);
  if (!acc) return { ok: false, error: 'Non autorisé.' };

  const { error } = await db
    .from('emails')
    .update({ [parsed.data.field]: parsed.data.value } as never)
    .eq('id', parsed.data.email_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/emails');
  return { ok: true };
}

const createAccountSchema = z.object({
  email: z.string().email(),
  display_name: z.string().trim().max(120).optional(),
  env_var_key: z.string().trim().min(2).max(60),
  imap_host: z.string().trim().min(2).max(200),
  imap_port: z.number().int().min(1).max(65535).default(993),
  smtp_host: z.string().trim().min(2).max(200),
  smtp_port: z.number().int().min(1).max(65535).default(465),
});

export async function createEmailAccountAction(
  input: z.input<typeof createAccountSchema>,
): Promise<{ ok: true; account_id: string } | { ok: false; error: string }> {
  const profile = await requireAdminProfile();
  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  const db = asAnyDb(getSupabaseServiceClient());
  const { data, error } = await db
    .from('email_accounts')
    .insert({ ...parsed.data, user_id: profile.id, is_active: true } as never)
    .select('id')
    .single();
  if (error || !data?.id) return { ok: false, error: error?.message ?? 'Création échouée' };
  revalidatePath('/admin/settings/email-accounts');
  return { ok: true, account_id: data.id as string };
}
