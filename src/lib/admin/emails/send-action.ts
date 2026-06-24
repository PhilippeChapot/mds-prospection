'use server';

/**
 * P12.x.EmailIntegration — server action d'envoi d'email depuis l'admin.
 * requireAdminProfile + Zod + vérif ownership du compte + sendEmailFromAccount
 * + audit log. Note 'use server' : seules des fonctions async exportées.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { type SupabaseClient } from '@supabase/supabase-js';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendEmailFromAccount } from '@/lib/email/smtp-send';

const asAnyDb = (c: ReturnType<typeof getSupabaseServiceClient>): SupabaseClient =>
  c as unknown as SupabaseClient;

const sendSchema = z.object({
  account_id: z.string().uuid(),
  to: z.array(z.string().email()).min(1).max(50),
  cc: z.array(z.string().email()).max(50).optional(),
  bcc: z.array(z.string().email()).max(50).optional(),
  subject: z.string().trim().min(1).max(500),
  body_html: z.string().min(1).max(200000),
  body_text: z.string().max(200000).optional(),
  in_reply_to: z.string().max(998).nullable().optional(),
  references: z.string().max(4000).nullable().optional(),
  prospect_id: z.string().uuid().nullable().optional(),
});

export type SendEmailActionInput = z.input<typeof sendSchema>;
export type SendEmailActionResult = { ok: true; email_id: string } | { ok: false; error: string };

export async function sendEmailAction(input: SendEmailActionInput): Promise<SendEmailActionResult> {
  const profile = await requireAdminProfile();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Paramètres invalides' };
  }
  const data = parsed.data;
  const db = asAnyDb(getSupabaseServiceClient());

  // Ownership : le compte doit appartenir à l'admin connecté.
  const { data: account } = await db
    .from('email_accounts')
    .select('id, user_id, is_active')
    .eq('id', data.account_id)
    .maybeSingle();
  if (!account) return { ok: false, error: 'Compte introuvable.' };
  if (account.user_id !== profile.id) {
    return { ok: false, error: 'Ce compte email ne vous appartient pas.' };
  }
  if (account.is_active === false) return { ok: false, error: 'Compte email désactivé.' };

  const result = await sendEmailFromAccount(db, {
    accountId: data.account_id,
    to: data.to,
    cc: data.cc,
    bcc: data.bcc,
    subject: data.subject,
    bodyHtml: data.body_html,
    bodyText: data.body_text,
    inReplyTo: data.in_reply_to ?? null,
    references: data.references ?? null,
  });
  if (!result.ok) return { ok: false, error: result.error };

  await db.from('audit_log').insert({
    user_id: profile.id,
    action: 'create',
    entity_type: 'email',
    entity_id: result.emailId || null,
    after: {
      kind: 'email_sent',
      account_id: data.account_id,
      to: data.to,
      subject: data.subject,
      prospect_id: data.prospect_id ?? null,
    } as never,
  });

  revalidatePath('/admin/emails');
  if (data.prospect_id) revalidatePath(`/admin/prospects/${data.prospect_id}`);
  return { ok: true, email_id: result.emailId };
}
