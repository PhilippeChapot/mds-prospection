/**
 * P8.5 — Vercel Cron consumer pour les relances lifecycle.
 *
 * Toutes les 5 minutes (cf vercel.json) :
 *   1. Auth via CRON_SECRET (header Authorization Bearer + Vercel internal).
 *   2. Poll lifecycle_send_queue WHERE status='pending' AND scheduled_for<=now()
 *      LIMIT 50.
 *   3. Pour chaque entrée : hydrate contact+rule, defense in depth (prefs
 *      verifiees une 2eme fois), choix subject_fr/en + body_fr_html/en_html
 *      selon contact.language, envoi via sendCampaignBatch (reuse P8.3).
 *   4. Update status='sent' ou 'error' + retry +5min jusqu a 3 tentatives.
 *   5. Update lifecycle_recipients.sent_at.
 *
 * Authentification :
 *   - Header `Authorization: Bearer <CRON_SECRET>` (configurable Vercel)
 *   - Header `x-vercel-cron` (envoye automatiquement par Vercel Cron)
 *   - L un OU l autre suffit (Vercel Cron interne + cron Supabase via pg_net
 *     plus tard pourront utiliser le secret).
 */

import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendCampaignBatch, type CampaignRecipient } from '@/lib/brevo/send-campaign';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000;

interface QueueRow {
  id: string;
  rule_id: string;
  contact_id: string;
  prospect_id: string | null;
  retry_count: number;
}

interface RuleRow {
  id: string;
  rule_key: string;
  pref_category: string;
  subject_fr: string;
  subject_en: string;
  body_fr_html: string;
  body_en_html: string;
}

interface ContactRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  language: 'FR' | 'EN';
  email_confidence: string;
  company_name: string | null;
  unsubscribed_all_at: string | null;
  pref: Record<string, boolean>;
}

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-vercel-cron');
  const expected = process.env.CRON_SECRET;
  if (cronHeader && expected) {
    // Vercel Cron interne + secret en env (defense in depth).
    return true;
  }
  if (!expected) return false;
  return auth === `Bearer ${expected}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = getSupabaseServiceClient();

  const { data: queueRows, error: queueErr } = await supabase
    .from('lifecycle_send_queue')
    .select('id, rule_id, contact_id, prospect_id, retry_count')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .lt('retry_count', MAX_RETRIES)
    .order('scheduled_for', { ascending: true })
    .limit(BATCH_SIZE);
  if (queueErr) {
    return NextResponse.json({ error: queueErr.message }, { status: 500 });
  }
  const queue = (queueRows ?? []) as QueueRow[];
  if (queue.length === 0) {
    return NextResponse.json({
      processed: 0,
      sent: 0,
      errors: 0,
      skipped: 0,
      duration_ms: Date.now() - startedAt,
    });
  }

  const ruleIds = Array.from(new Set(queue.map((q) => q.rule_id)));
  const { data: rulesRaw } = await supabase
    .from('lifecycle_rules')
    .select('id, rule_key, pref_category, subject_fr, subject_en, body_fr_html, body_en_html')
    .in('id', ruleIds);
  const rules = new Map<string, RuleRow>((rulesRaw ?? []).map((r) => [r.id, r as RuleRow]));

  const contactIds = Array.from(new Set(queue.map((q) => q.contact_id)));
  const contacts = await hydrateContacts(supabase, contactIds);

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL ?? 'philippe@mediadays.solutions';
  const senderName = process.env.BREVO_SENDER_NAME ?? 'MediaDays Solutions';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';

  let sent = 0;
  let errors = 0;
  let skipped = 0;

  for (const q of queue) {
    const rule = rules.get(q.rule_id);
    const contact = contacts.get(q.contact_id);
    if (!rule || !contact) {
      skipped++;
      await markCancelled(supabase, q.id, 'Rule or contact missing post-queue');
      continue;
    }
    // Defense in depth : reverifier les prefs (peuvent avoir change depuis
    // la queue). Aussi : low_confidence skip si pas pref_facturation
    // (regles marketing/event).
    if (contact.unsubscribed_all_at) {
      skipped++;
      await markCancelled(supabase, q.id, 'Unsubscribed post-queue');
      continue;
    }
    const prefValue = contact.pref[rule.pref_category];
    if (prefValue === false) {
      skipped++;
      await markCancelled(supabase, q.id, `Preference ${rule.pref_category} declined post-queue`);
      continue;
    }
    if (contact.email_confidence === 'low' && rule.pref_category !== 'pref_facturation') {
      skipped++;
      await markCancelled(supabase, q.id, 'email_confidence low + non-billing rule');
      continue;
    }

    if (!apiKey) {
      errors++;
      await markErrored(supabase, q, 'BREVO_API_KEY missing', 0);
      continue;
    }

    const isEn = contact.language === 'EN';
    const recipient: CampaignRecipient = {
      contact_id: contact.id,
      email: contact.email,
      first_name: contact.first_name,
      last_name: contact.last_name,
      company_name: contact.company_name,
      language: contact.language,
    };

    try {
      const batch = await sendCampaignBatch({
        apiKey,
        senderEmail,
        senderName,
        recipients: [recipient],
        subject: isEn ? rule.subject_en : rule.subject_fr,
        htmlContent: isEn ? rule.body_en_html : rule.body_fr_html,
        appUrl,
      });

      if (batch.errors.length > 0) {
        errors++;
        await markErrored(supabase, q, batch.errors[0].error_message ?? 'unknown', RETRY_DELAY_MS);
        continue;
      }
      const messageId = batch.brevo_ids[0]?.message_id ?? null;
      await supabase
        .from('lifecycle_send_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          attempted_at: new Date().toISOString(),
          brevo_message_id: messageId,
        } as never)
        .eq('id', q.id);
      await supabase
        .from('lifecycle_recipients')
        .update({ sent_at: new Date().toISOString() } as never)
        .eq('rule_id', q.rule_id)
        .eq('contact_id', q.contact_id);
      sent++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      await markErrored(supabase, q, msg, RETRY_DELAY_MS);
    }
  }

  return NextResponse.json({
    processed: queue.length,
    sent,
    errors,
    skipped,
    duration_ms: Date.now() - startedAt,
  });
}

async function hydrateContacts(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  contactIds: string[],
): Promise<Map<string, ContactRow>> {
  const { data: rows } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, language, email_confidence, company:companies(name)')
    .in('id', contactIds);

  const out = new Map<string, ContactRow>();
  if (!rows) return out;

  const { data: prefRows } = await supabase
    .from('contact_preferences')
    .select(
      'contact_id, pref_general, pref_exposant, pref_facturation, pref_kit_media, pref_administration, pref_partenariat, pref_post_event, unsubscribed_all_at',
    )
    .in('contact_id', contactIds);
  const prefByContact = new Map<
    string,
    {
      pref: Record<string, boolean>;
      unsubscribed_all_at: string | null;
    }
  >();
  for (const p of prefRows ?? []) {
    prefByContact.set(p.contact_id, {
      pref: {
        pref_general: Boolean(p.pref_general),
        pref_exposant: Boolean(p.pref_exposant),
        pref_facturation: Boolean(p.pref_facturation),
        pref_kit_media: Boolean(p.pref_kit_media),
        pref_administration: Boolean(p.pref_administration),
        pref_partenariat: Boolean(p.pref_partenariat),
        pref_post_event: Boolean(p.pref_post_event),
      },
      unsubscribed_all_at: p.unsubscribed_all_at,
    });
  }

  for (const r of rows) {
    const companyName = Array.isArray(r.company)
      ? ((r.company[0] as { name?: string })?.name ?? null)
      : ((r.company as { name?: string } | null)?.name ?? null);
    const pref = prefByContact.get(r.id);
    out.set(r.id, {
      id: r.id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      language: (r.language === 'EN' ? 'EN' : 'FR') as 'FR' | 'EN',
      email_confidence: r.email_confidence,
      company_name: companyName,
      unsubscribed_all_at: pref?.unsubscribed_all_at ?? null,
      pref: pref?.pref ?? {
        // Defaults conformes a la table contact_preferences si pas encore initialisee.
        pref_general: true,
        pref_exposant: false,
        pref_facturation: false,
        pref_kit_media: false,
        pref_administration: false,
        pref_partenariat: false,
        pref_post_event: false,
      },
    });
  }
  return out;
}

async function markCancelled(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  queueId: string,
  reason: string,
) {
  await supabase
    .from('lifecycle_send_queue')
    .update({
      status: 'cancelled',
      attempted_at: new Date().toISOString(),
      error_message: reason,
    } as never)
    .eq('id', queueId);
}

async function markErrored(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  queue: QueueRow,
  message: string,
  retryDelayMs: number,
) {
  const nextRetry = queue.retry_count + 1;
  const isFinal = nextRetry >= MAX_RETRIES;
  await supabase
    .from('lifecycle_send_queue')
    .update({
      status: isFinal ? 'error' : 'pending',
      retry_count: nextRetry,
      attempted_at: new Date().toISOString(),
      error_message: message,
      scheduled_for: new Date(Date.now() + retryDelayMs).toISOString(),
    } as never)
    .eq('id', queue.id);
}
