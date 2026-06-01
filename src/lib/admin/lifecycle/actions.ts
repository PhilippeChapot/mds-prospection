'use server';

/**
 * P8.5 — server actions admin pour la gestion des 8 regles lifecycle.
 *
 * Actions :
 *   - toggleLifecycleRuleAction         : super_admin only (active/desactive
 *     une regle). Audit log obligatoire.
 *   - editLifecycleTemplateAction       : admin/super_admin (edit subject +
 *     body FR/EN). Reset les flags _translated_by_ai_at touches.
 *   - translateLifecycleRuleAction      : admin/super_admin. Reuse Claude
 *     Haiku 4.5 (cf P8.3-quater). Aucune PII destinataire.
 *   - dryRunLifecycleRuleAction         : admin/super_admin. Liste les
 *     contacts qui SERAIENT cibles MAINTENANT sans toucher la queue.
 *   - reTargetLifecycleRuleAction       : super_admin only. DELETE FROM
 *     lifecycle_recipients WHERE rule_id=X (la prochaine exec cron re-cible
 *     tout le monde). Modal de confirmation obligatoire cote UI.
 *
 * RBAC strict :
 *   - super_admin : toggle + re-target (destructeurs)
 *   - admin/super_admin : edit + translate + dry-run
 *   - sales : aucune action
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[admin/lifecycle/actions]';
const MODEL = 'claude-haiku-4-5-20251001';

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const ruleKeySchema = z.object({ rule_key: z.string().min(1) });

// ----------------------------------------------------------------------------
// toggleLifecycleRuleAction (super_admin only)
// ----------------------------------------------------------------------------

const toggleSchema = z.object({
  rule_key: z.string().min(1),
  is_active: z.boolean(),
});

export async function toggleLifecycleRuleAction(
  input: z.input<typeof toggleSchema>,
): Promise<ActionResult> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'super_admin') {
    return { ok: false, error: 'Reserve aux super-admins (audit RGPD).' };
  }
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const supabase = getSupabaseServiceClient();
  const { data: rule } = await supabase
    .from('lifecycle_rules')
    .select('id, is_active')
    .eq('rule_key', parsed.data.rule_key)
    .maybeSingle();
  if (!rule) return { ok: false, error: 'Regle introuvable.' };

  const { error } = await supabase
    .from('lifecycle_rules')
    .update({
      is_active: parsed.data.is_active,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', rule.id);
  if (error) return { ok: false, error: error.message };

  // Audit log.
  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'lifecycle_rules',
    entity_id: rule.id,
    action: 'update',
    before: { is_active: rule.is_active } as never,
    after: {
      kind: 'lifecycle_rule_toggled',
      actor_role: profile.role,
      rule_key: parsed.data.rule_key,
      is_active: parsed.data.is_active,
    } as never,
  });

  revalidatePath('/admin/lifecycle');
  return { ok: true };
}

// ----------------------------------------------------------------------------
// editLifecycleTemplateAction (admin/super_admin)
// ----------------------------------------------------------------------------

const editSchema = z.object({
  rule_key: z.string().min(1),
  subject_fr: z.string().trim().min(1).max(200),
  subject_en: z.string().trim().min(1).max(200),
  body_fr_html: z.string().trim().min(1),
  body_en_html: z.string().trim().min(1),
});

export async function editLifecycleTemplateAction(
  input: z.input<typeof editSchema>,
): Promise<ActionResult> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    return { ok: false, error: 'Reserve aux admins.' };
  }
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const supabase = getSupabaseServiceClient();
  const { data: rule } = await supabase
    .from('lifecycle_rules')
    .select('id, subject_fr, subject_en, body_fr_html, body_en_html')
    .eq('rule_key', parsed.data.rule_key)
    .maybeSingle();
  if (!rule) return { ok: false, error: 'Regle introuvable.' };

  // Reset flag IA si le contenu d'une langue a change manuellement.
  const frChanged =
    rule.subject_fr !== parsed.data.subject_fr || rule.body_fr_html !== parsed.data.body_fr_html;
  const enChanged =
    rule.subject_en !== parsed.data.subject_en || rule.body_en_html !== parsed.data.body_en_html;

  const patch: Record<string, unknown> = {
    subject_fr: parsed.data.subject_fr,
    subject_en: parsed.data.subject_en,
    body_fr_html: parsed.data.body_fr_html,
    body_en_html: parsed.data.body_en_html,
    updated_by: profile.id,
    updated_at: new Date().toISOString(),
  };
  if (frChanged) patch.fr_translated_by_ai_at = null;
  if (enChanged) patch.en_translated_by_ai_at = null;

  const { error } = await supabase
    .from('lifecycle_rules')
    .update(patch as never)
    .eq('id', rule.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/lifecycle');
  return { ok: true };
}

// ----------------------------------------------------------------------------
// translateLifecycleRuleAction (admin/super_admin) — Claude Haiku 4.5
// ----------------------------------------------------------------------------

const translateSchema = z.object({
  rule_key: z.string().min(1),
  source: z.enum(['fr', 'en']),
  target: z.enum(['fr', 'en']),
});

const SYSTEM_PROMPT = `Tu traduis des emails de relance lifecycle B2B pour MediaDays Solutions, le rendez-vous business de l'audio, la radio et le podcast organisé par les Éditions HF (Brive) à Marseille (10 déc 2026) et Paris (15 déc 2026).

RÈGLES STRICTES :
1. Conserve à l'identique : les balises HTML, les variables {prenom} {societe} {etape}, les noms propres (MediaDays Solutions, Éditions HF, Brive, Marseille, Paris), les URLs, les emails.
2. Conserve le ton professionnel mais chaleureux (registre B2B premium, pas guindé).
3. Conserve les majuscules sur "MediaDays Solutions".
4. N'invente pas de contenu absent du source.
5. N'ajoute aucun commentaire, préambule ou note de traduction.
6. Réponds UNIQUEMENT en JSON valide : { "subject": "...", "body_html": "..." }`;

export async function translateLifecycleRuleAction(
  input: z.input<typeof translateSchema>,
): Promise<
  ActionResult<{ subject: string; body_html: string; model: string; translated_at: string }>
> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    return { ok: false, error: 'Reserve aux admins.' };
  }
  const parsed = translateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }
  if (parsed.data.source === parsed.data.target) {
    return { ok: false, error: 'Source et cible identiques.' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY missing in env.' };
  }

  const supabase = getSupabaseServiceClient();
  const { data: rule } = await supabase
    .from('lifecycle_rules')
    .select('id, subject_fr, subject_en, body_fr_html, body_en_html')
    .eq('rule_key', parsed.data.rule_key)
    .maybeSingle();
  if (!rule) return { ok: false, error: 'Regle introuvable.' };

  const sourceSubject = parsed.data.source === 'fr' ? rule.subject_fr : rule.subject_en;
  const sourceBody = parsed.data.source === 'fr' ? rule.body_fr_html : rule.body_en_html;
  if (!sourceSubject || !sourceBody) {
    return { ok: false, error: `La version ${parsed.data.source.toUpperCase()} est vide.` };
  }

  const targetLangName = parsed.data.target === 'fr' ? 'français' : 'anglais';

  let parsedResponse: { subject: string; body_html: string };
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Traduis vers le ${targetLangName}.

Objet source :
${sourceSubject}

Body HTML source :
${sourceBody}

Réponds en JSON : { "subject": "...", "body_html": "..." }`,
        },
      ],
    });

    const block = response.content[0];
    const text = block?.type === 'text' ? block.text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return { ok: false, error: 'Reponse IA invalide (pas de JSON detecte).' };
    }
    try {
      parsedResponse = JSON.parse(match[0]);
    } catch {
      return { ok: false, error: 'Reponse IA non parsable.' };
    }
    if (
      typeof parsedResponse.subject !== 'string' ||
      typeof parsedResponse.body_html !== 'string'
    ) {
      return { ok: false, error: 'Reponse IA incomplete (subject ou body_html manquant).' };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Anthropic API error',
    };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> =
    parsed.data.target === 'en'
      ? {
          subject_en: parsedResponse.subject,
          body_en_html: parsedResponse.body_html,
          en_translated_by_ai_at: now,
          translation_model: MODEL,
        }
      : {
          subject_fr: parsedResponse.subject,
          body_fr_html: parsedResponse.body_html,
          fr_translated_by_ai_at: now,
          translation_model: MODEL,
        };
  patch.updated_by = profile.id;
  patch.updated_at = now;

  const { error } = await supabase
    .from('lifecycle_rules')
    .update(patch as never)
    .eq('id', rule.id);
  if (error) return { ok: false, error: `Update DB failed: ${error.message}` };

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'lifecycle_rules',
    entity_id: rule.id,
    action: 'update',
    after: {
      kind: 'lifecycle_rule_translated_by_ai',
      actor_role: profile.role,
      rule_key: parsed.data.rule_key,
      source: parsed.data.source,
      target: parsed.data.target,
      model: MODEL,
    } as never,
  });

  revalidatePath('/admin/lifecycle');
  return {
    ok: true,
    data: {
      subject: parsedResponse.subject,
      body_html: parsedResponse.body_html,
      model: MODEL,
      translated_at: now,
    },
  };
}

// ----------------------------------------------------------------------------
// dryRunLifecycleRuleAction (admin/super_admin) — preview
// ----------------------------------------------------------------------------

interface DryRunCandidate {
  contact_id: string;
  email: string;
  full_name: string;
  company_name: string | null;
  prospect_id: string | null;
  language: 'FR' | 'EN';
}

export async function dryRunLifecycleRuleAction(
  input: z.input<typeof ruleKeySchema>,
): Promise<ActionResult<{ candidates: DryRunCandidate[] }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    return { ok: false, error: 'Reserve aux admins.' };
  }
  const parsed = ruleKeySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Donnees invalides' };
  }

  const supabase = getSupabaseServiceClient();
  const { data: rule } = await supabase
    .from('lifecycle_rules')
    .select('id, rule_key, pref_category')
    .eq('rule_key', parsed.data.rule_key)
    .maybeSingle();
  if (!rule) return { ok: false, error: 'Regle introuvable.' };

  // Dry-run = appliquer les memes filtres SQL que les fn_detect_* mais SANS
  // INSERT en queue ni en recipients. On force is_active=true virtuellement
  // en query directe sur les prospects.
  // Pour V1 simple : on requete les eligibles via une query parametree par
  // rule_key (mirror du contenu des fn_detect_*). On limit 100.
  const eligible = await fetchDryRunCandidates(supabase, parsed.data.rule_key);
  return { ok: true, data: { candidates: eligible } };
}

async function fetchDryRunCandidates(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  ruleKey: string,
): Promise<DryRunCandidate[]> {
  // On query prospects + contacts + prefs selon la regle.
  // Pour V1 on supporte les 4 regles temporelles principales. Les regles
  // event (J-30/J-7/J-1/J+2) sont evaluees a une date precise donc le
  // dry-run montre toujours les eligibles SIGNED (et l admin sait que
  // ca declenche au bon J).

  type Row = {
    prospect_id: string;
    contact_id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    language: string;
    company_name: string | null;
  };
  const rows: Row[] = [];

  // Conditions SQL identiques aux fn_detect_*.
  let query = supabase
    .from('prospects')
    .select(
      `id,
       sellsy_devis_emitted_at, signed_at, acompte_paid_at, status, created_at, is_test,
       contact:contacts!prospects_primary_contact_id_fkey(id, email, first_name, last_name, language, email_confidence,
         preferences:contact_preferences(pref_general, pref_exposant, pref_facturation, pref_post_event, unsubscribed_all_at)),
       company:companies(name)`,
    )
    .eq('is_test', false)
    .limit(100);

  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  void oneHourAgo;

  switch (ruleKey) {
    case 'signup_24h_no_quote':
      query = query
        .lte('created_at', new Date(Date.now() - 86_400_000).toISOString())
        .is('sellsy_devis_emitted_at', null)
        .eq('status', 'lead');
      break;
    case 'quote_sent_7d_no_signature':
      query = query
        .lte('sellsy_devis_emitted_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
        .is('signed_at', null)
        .not('status', 'eq', 'perdu');
      break;
    case 'signed_3d_no_payment':
      query = query
        .lte('signed_at', new Date(Date.now() - 3 * 86_400_000).toISOString())
        .is('acompte_paid_at', null);
      break;
    case 'payment_1d_welcome':
      query = query
        .lte('acompte_paid_at', new Date(Date.now() - 86_400_000).toISOString())
        .gte('acompte_paid_at', new Date(Date.now() - 3 * 86_400_000).toISOString());
      break;
    default:
      // Pour les regles event_J*, on prend tous les signed (l admin sait
      // que la regle s'execute au bon J).
      query = query.not('signed_at', 'is', null);
      break;
  }

  const { data } = await query;
  if (!data) return [];

  for (const p of data as unknown as Array<{
    id: string;
    contact: Array<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      language: string;
      email_confidence: string;
      preferences: Array<Record<string, unknown>>;
    }> | null;
    company: Array<{ name: string }> | null;
  }>) {
    const contact = Array.isArray(p.contact) ? p.contact[0] : p.contact;
    if (!contact) continue;
    const pref = Array.isArray(contact.preferences) ? contact.preferences[0] : contact.preferences;
    if (pref?.unsubscribed_all_at) continue;
    rows.push({
      prospect_id: p.id,
      contact_id: contact.id,
      email: contact.email,
      first_name: contact.first_name,
      last_name: contact.last_name,
      language: contact.language === 'EN' ? 'EN' : 'FR',
      company_name: Array.isArray(p.company)
        ? (p.company[0]?.name ?? null)
        : ((p.company as { name?: string } | null)?.name ?? null),
    });
  }

  return rows.map((r) => ({
    contact_id: r.contact_id,
    email: r.email,
    full_name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email,
    company_name: r.company_name,
    prospect_id: r.prospect_id,
    language: r.language as 'FR' | 'EN',
  }));
}

// ----------------------------------------------------------------------------
// reTargetLifecycleRuleAction (super_admin only)
// ----------------------------------------------------------------------------

export async function reTargetLifecycleRuleAction(
  input: z.input<typeof ruleKeySchema>,
): Promise<ActionResult<{ deleted: number }>> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'super_admin') {
    return { ok: false, error: 'Reserve aux super-admins.' };
  }
  const parsed = ruleKeySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Donnees invalides' };
  }

  const supabase = getSupabaseServiceClient();
  const { data: rule } = await supabase
    .from('lifecycle_rules')
    .select('id, rule_key')
    .eq('rule_key', parsed.data.rule_key)
    .maybeSingle();
  if (!rule) return { ok: false, error: 'Regle introuvable.' };

  const { error, count } = await supabase
    .from('lifecycle_recipients')
    .delete({ count: 'exact' })
    .eq('rule_id', rule.id);
  if (error) return { ok: false, error: error.message };

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'lifecycle_rules',
    entity_id: rule.id,
    action: 'update',
    after: {
      kind: 'lifecycle_rule_retargeted',
      actor_role: profile.role,
      rule_key: parsed.data.rule_key,
      deleted_recipients: count ?? 0,
    } as never,
  });

  // Suppress unused var lint
  void LOG_PREFIX;

  revalidatePath('/admin/lifecycle');
  return { ok: true, data: { deleted: count ?? 0 } };
}
