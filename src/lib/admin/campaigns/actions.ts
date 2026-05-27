'use server';

/**
 * P8.3 — server actions Admin Emailing Center.
 *
 * Actions :
 *   - listCampaignsAction         : liste + stats (admin/sales).
 *   - previewAudienceAction       : compte eligibles + exclus (admin/sales).
 *   - createCampaignAction        : crée draft (admin/sales).
 *   - sendTestEmailAction         : envoie 1 email test (admin/sales).
 *   - sendCampaignAction          : envoi de masse (admin/super_admin ONLY).
 *   - cancelCampaignAction        : annule draft/scheduled.
 *
 * RGPD : tout l'envoi de masse passe par resolveAudience() (audiences.ts)
 * qui applique le filtre prefs P8.1 + unsubscribed. Les contacts skipped
 * sont loggés dans campaign_recipients avec skip_reason pour tracabilite.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { resolveAudience } from './audiences';
import {
  sendCampaignBatch,
  buildUnsubscribeFooter,
  personalize,
  type CampaignRecipient,
} from '@/lib/brevo/send-campaign';
import {
  CAMPAIGN_CATEGORIES,
  type AudiencePreviewResult,
  type CampaignActionResult,
  type CampaignCategory,
  type ContentMode,
} from './types';

const LOG_PREFIX = '[campaigns]';

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

const previewSchema = z.object({
  audience_key: z.string().min(1),
  category: z.enum(CAMPAIGN_CATEGORIES),
  filters: z
    .object({
      poles: z.array(z.string()).optional(),
      etapes: z.array(z.string()).optional(),
      langue: z.enum(['FR', 'EN']).optional(),
    })
    .optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(3).max(200),
  category: z.enum(CAMPAIGN_CATEGORIES),
  audience_key: z.string().min(1),
  audience_filters: z.record(z.string(), z.unknown()).optional(),
  content_mode: z.enum(['inline', 'template']),
  subject: z.string().trim().min(2).max(200),
  body_html: z.string().optional(),
  brevo_template_id: z.number().int().positive().optional(),
  scheduled_at: z.string().datetime().optional(),
});

const sendTestSchema = z.object({
  campaign_id: z.string().uuid(),
  test_email: z.string().trim().toLowerCase().email(),
});

const sendCampaignSchema = z.object({
  campaign_id: z.string().uuid(),
  confirmation_count: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// listCampaignsAction
// ---------------------------------------------------------------------------

export interface CampaignListItem {
  id: string;
  name: string;
  category: string | null;
  audience_key: string | null;
  status: string;
  recipient_count: number;
  sent_count: number;
  error_count: number;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  created_by_user_id: string;
  created_by_name: string | null;
}

export async function listCampaignsAction(): Promise<CampaignListItem[]> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('email_campaigns')
    .select(
      `id, name, category, audience_key, status, recipient_count, sent_count, error_count,
       scheduled_at, sent_at, created_at, created_by_user_id,
       creator:users!created_by_user_id(full_name)`,
    )
    .order('created_at', { ascending: false })
    .limit(100);
  return (data ?? []).map((r) => {
    const creator = Array.isArray(r.creator) ? r.creator[0] : r.creator;
    return {
      id: r.id,
      name: r.name,
      category: r.category ?? null,
      audience_key: r.audience_key ?? null,
      status: r.status,
      recipient_count: r.recipient_count ?? 0,
      sent_count: r.sent_count ?? 0,
      error_count: r.error_count ?? 0,
      scheduled_at: r.scheduled_at,
      sent_at: r.sent_at,
      created_at: r.created_at,
      created_by_user_id: r.created_by_user_id,
      created_by_name: (creator as { full_name?: string } | null)?.full_name ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// previewAudienceAction
// ---------------------------------------------------------------------------

export async function previewAudienceAction(
  input: z.input<typeof previewSchema>,
): Promise<AudiencePreviewResult> {
  await requireAdminProfile();
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'invalid');
  }
  const supabase = getSupabaseServiceClient();
  const result = await resolveAudience(supabase, {
    audienceKey: parsed.data.audience_key,
    category: parsed.data.category,
    filters: parsed.data.filters,
  });

  const excluded_pref_off = result.skipped.filter((s) => s.reason === 'pref_off').length;
  const excluded_unsubscribed = result.skipped.filter((s) => s.reason === 'unsubscribed').length;
  const excluded_no_email = result.skipped.filter(
    (s) => s.reason === 'invalid_email' || s.reason === 'duplicate',
  ).length;

  return {
    total_eligible: result.eligible.length,
    excluded_pref_off,
    excluded_unsubscribed,
    excluded_no_email,
    sample: result.eligible.slice(0, 5).map((r) => ({
      contact_id: r.contact_id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      company_name: r.company_name,
    })),
  };
}

// ---------------------------------------------------------------------------
// createCampaignAction
// ---------------------------------------------------------------------------

export async function createCampaignAction(
  input: z.input<typeof createSchema>,
): Promise<CampaignActionResult<{ campaign_id: string }>> {
  const profile = await requireAdminProfile();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const data = parsed.data;

  // Validation content mode.
  if (data.content_mode === 'inline' && !data.body_html) {
    return { ok: false, error: 'body_html requis pour mode inline.' };
  }
  if (data.content_mode === 'template' && !data.brevo_template_id) {
    return { ok: false, error: 'brevo_template_id requis pour mode template.' };
  }

  const supabase = getSupabaseServiceClient();
  const status = data.scheduled_at ? 'scheduled' : 'draft';
  const { data: row, error } = await supabase
    .from('email_campaigns')
    .insert({
      name: data.name,
      category: data.category,
      audience_key: data.audience_key,
      audience_filters: (data.audience_filters ?? {}) as never,
      content_mode: data.content_mode,
      subject_fr: data.subject,
      body_fr: data.body_html ?? null,
      brevo_template_id: data.brevo_template_id ?? null,
      scheduled_at: data.scheduled_at ?? null,
      status,
      created_by_user_id: profile.id,
    } as never)
    .select('id')
    .single();
  if (error || !row) {
    return { ok: false, error: `Insert failed: ${error?.message ?? 'unknown'}` };
  }

  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      entity_type: 'email_campaigns',
      entity_id: row.id,
      action: 'create',
      after: {
        kind: 'campaign_created',
        name: data.name,
        audience_key: data.audience_key,
      } as never,
    });
  } catch (err) {
    console.warn(
      '%s audit-log-failed msg=%s',
      LOG_PREFIX,
      err instanceof Error ? err.message : String(err),
    );
  }

  revalidatePath('/admin/campaigns');
  return { ok: true, campaign_id: row.id };
}

// ---------------------------------------------------------------------------
// sendTestEmailAction
// ---------------------------------------------------------------------------

export async function sendTestEmailAction(
  input: z.input<typeof sendTestSchema>,
): Promise<CampaignActionResult> {
  const profile = await requireAdminProfile();
  const parsed = sendTestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const supabase = getSupabaseServiceClient();

  const { data: campaign } = await supabase
    .from('email_campaigns')
    .select('id, name, subject_fr, body_fr, content_mode, brevo_template_id')
    .eq('id', parsed.data.campaign_id)
    .maybeSingle();
  if (!campaign) return { ok: false, error: 'Campagne introuvable.' };

  const subject = `[TEST] ${campaign.subject_fr ?? campaign.name}`;
  // En V1 le test est envoye via Resend (rapide + fiable, pas besoin de
  // configurer Brevo pour ce test). Le vrai envoi de masse passe par
  // Brevo (sendCampaignAction).
  const sampleRecipient: CampaignRecipient = {
    contact_id: 'test',
    email: parsed.data.test_email,
    first_name: profile.full_name?.split(' ')[0] ?? 'Test',
    last_name: 'User',
    company_name: 'Test SAS',
    language: 'FR',
  };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';

  let html: string;
  if ((campaign.content_mode as ContentMode) === 'inline') {
    if (!campaign.body_fr) return { ok: false, error: 'Body manquant.' };
    const personalized = personalize(campaign.body_fr, sampleRecipient);
    const footer = buildUnsubscribeFooter({ locale: 'fr', appUrl });
    html = `${personalized}\n${footer}`;
  } else {
    html = `<p>Cette campagne utilise un template Brevo (id=${campaign.brevo_template_id}).
      Le test reel doit passer par l'envoi de campagne (le rendu template
      est specifique a Brevo).</p>`;
  }

  try {
    await sendTransactionalEmailViaResend({
      to: parsed.data.test_email,
      toName: 'Test',
      subject,
      html,
      text: html.replace(/<[^>]+>/g, ''),
      tags: [{ name: 'category', value: 'campaign_test' }],
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Resend down' };
  }

  await supabase
    .from('email_campaigns')
    .update({ test_email_sent_at: new Date().toISOString() } as never)
    .eq('id', parsed.data.campaign_id);
  revalidatePath(`/admin/campaigns/${parsed.data.campaign_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// sendCampaignAction (admin/super_admin only — pas sales)
// ---------------------------------------------------------------------------

export async function sendCampaignAction(
  input: z.input<typeof sendCampaignSchema>,
): Promise<CampaignActionResult<{ sent: number; errors: number; skipped: number }>> {
  const profile = await requireAdminProfile();
  // Gate strict : sales ne peut PAS envoyer.
  if (profile.role === 'sales') {
    return { ok: false, error: 'Seul un admin peut envoyer une campagne.' };
  }
  const parsed = sendCampaignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const supabase = getSupabaseServiceClient();

  // Lecture campagne complete.
  const { data: campaign } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', parsed.data.campaign_id)
    .maybeSingle();
  if (!campaign) return { ok: false, error: 'Campagne introuvable.' };
  if (campaign.status === 'sent' || campaign.status === 'sending') {
    return { ok: false, error: `Campagne deja en cours/envoyee (status=${campaign.status}).` };
  }
  if (!campaign.test_email_sent_at) {
    return { ok: false, error: "Envoyez d'abord un email test." };
  }
  if (!campaign.audience_key || !campaign.category) {
    return { ok: false, error: 'Audience ou categorie manquante.' };
  }

  // Resoudre l'audience.
  const filters = (campaign.audience_filters ?? {}) as {
    poles?: string[];
    etapes?: string[];
    langue?: 'FR' | 'EN';
  };
  const resolution = await resolveAudience(supabase, {
    audienceKey: campaign.audience_key,
    category: campaign.category as CampaignCategory,
    filters,
  });

  // Garde-fou confirmation chiffree.
  if (parsed.data.confirmation_count !== resolution.eligible.length) {
    return {
      ok: false,
      error: `Confirmation incorrecte. Vous avez tapé ${parsed.data.confirmation_count} mais l'audience contient ${resolution.eligible.length} destinataires.`,
    };
  }

  // Mark sending.
  await supabase
    .from('email_campaigns')
    .update({ status: 'sending', recipient_count: resolution.eligible.length } as never)
    .eq('id', campaign.id);

  // Logger TOUS les destinataires (eligibles pending + skipped).
  const allRecipients = [
    ...resolution.eligible.map((r) => ({
      campaign_id: campaign.id,
      contact_id: r.contact_id,
      email: r.email,
      status: 'pending' as const,
      skip_reason: null,
    })),
    ...resolution.skipped.map((s) => ({
      campaign_id: campaign.id,
      contact_id: s.contact_id,
      email: s.email,
      status: 'skipped' as const,
      skip_reason: s.reason,
    })),
  ];
  if (allRecipients.length > 0) {
    // chunk insert (Supabase limite ~1000)
    const CHUNK = 500;
    for (let i = 0; i < allRecipients.length; i += CHUNK) {
      await supabase.from('campaign_recipients').insert(allRecipients.slice(i, i + CHUNK) as never);
    }
  }

  if (resolution.eligible.length === 0) {
    await supabase
      .from('email_campaigns')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_by_user_id: profile.id,
        sent_count: 0,
        error_count: 0,
      } as never)
      .eq('id', campaign.id);
    return { ok: true, sent: 0, errors: 0, skipped: resolution.skipped.length };
  }

  // Envoi Brevo batch.
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    await supabase
      .from('email_campaigns')
      .update({ status: 'error' } as never)
      .eq('id', campaign.id);
    return { ok: false, error: 'BREVO_API_KEY missing in env.' };
  }
  const senderEmail = process.env.BREVO_SENDER_EMAIL ?? 'philippe@mediadays.solutions';
  const senderName = process.env.BREVO_SENDER_NAME ?? 'MediaDays Solutions';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';

  let result;
  try {
    result = await sendCampaignBatch({
      apiKey,
      senderEmail,
      senderName,
      recipients: resolution.eligible,
      subject: campaign.subject_fr ?? campaign.name,
      htmlContent:
        (campaign.content_mode as ContentMode) === 'inline'
          ? (campaign.body_fr ?? undefined)
          : undefined,
      templateId:
        (campaign.content_mode as ContentMode) === 'template'
          ? (campaign.brevo_template_id ?? undefined)
          : undefined,
      appUrl,
    });
  } catch (err) {
    await supabase
      .from('email_campaigns')
      .update({ status: 'error' } as never)
      .eq('id', campaign.id);
    return { ok: false, error: err instanceof Error ? err.message : 'Brevo send failed' };
  }

  // Update campaign_recipients par destinataire.
  const now = new Date().toISOString();
  for (const s of result.brevo_ids) {
    await supabase
      .from('campaign_recipients')
      .update({
        status: 'sent',
        brevo_message_id: s.message_id,
        sent_at: now,
      } as never)
      .eq('campaign_id', campaign.id)
      .eq('contact_id', s.contact_id);
  }
  for (const e of result.errors) {
    await supabase
      .from('campaign_recipients')
      .update({
        status: 'error',
        error_message: e.error_message,
      } as never)
      .eq('campaign_id', campaign.id)
      .eq('contact_id', e.contact_id);
  }

  // Update campaign final.
  await supabase
    .from('email_campaigns')
    .update({
      status: 'sent',
      sent_at: now,
      sent_by_user_id: profile.id,
      sent_count: result.sent,
      error_count: result.errors.length,
    } as never)
    .eq('id', campaign.id);

  // Audit log.
  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      entity_type: 'email_campaigns',
      entity_id: campaign.id,
      action: 'update',
      after: {
        kind: 'campaign_sent',
        actor_role: profile.role,
        sent: result.sent,
        errors: result.errors.length,
        skipped: resolution.skipped.length,
      } as never,
    });
  } catch (err) {
    console.warn(
      '%s audit-log-failed msg=%s',
      LOG_PREFIX,
      err instanceof Error ? err.message : String(err),
    );
  }

  revalidatePath('/admin/campaigns');
  return {
    ok: true,
    sent: result.sent,
    errors: result.errors.length,
    skipped: resolution.skipped.length,
  };
}

// ---------------------------------------------------------------------------
// cancelCampaignAction
// ---------------------------------------------------------------------------

export async function cancelCampaignAction(input: {
  campaign_id: string;
}): Promise<CampaignActionResult> {
  const profile = await requireAdminProfile();
  if (profile.role === 'sales') {
    return { ok: false, error: 'Seul un admin peut annuler une campagne.' };
  }
  const supabase = getSupabaseServiceClient();
  const { data: c } = await supabase
    .from('email_campaigns')
    .select('status')
    .eq('id', input.campaign_id)
    .maybeSingle();
  if (!c) return { ok: false, error: 'Campagne introuvable.' };
  if (c.status !== 'draft' && c.status !== 'scheduled') {
    return { ok: false, error: `Impossible d'annuler une campagne ${c.status}.` };
  }
  await supabase
    .from('email_campaigns')
    .update({ status: 'cancelled' } as never)
    .eq('id', input.campaign_id);

  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      entity_type: 'email_campaigns',
      entity_id: input.campaign_id,
      action: 'update',
      after: { kind: 'campaign_cancelled', actor_role: profile.role } as never,
    });
  } catch (err) {
    console.warn(
      '%s audit-log-failed msg=%s',
      LOG_PREFIX,
      err instanceof Error ? err.message : String(err),
    );
  }

  revalidatePath('/admin/campaigns');
  return { ok: true };
}
