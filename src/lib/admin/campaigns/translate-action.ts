'use server';

/**
 * P8.3-quater — server actions traduction IA des campagnes (Claude Haiku 4.5).
 *
 * Actions :
 *   - translateCampaignAction : traduit source -> target (FR<->EN) via
 *     Anthropic Haiku 4.5. Stocke en DB + timestamp + modele.
 *   - markCampaignBodyManuallyEditedAction : reset le flag IA quand l'admin
 *     edite manuellement (le badge "Traduit par IA - a relire" disparait).
 *
 * RBAC : admin OU super_admin uniquement (sales ne peut pas declencher
 * une depense Anthropic).
 *
 * RGPD : aucun PII contact ne transite — seul le contenu campagne
 * (subject + body_html) est envoye dans le prompt.
 *
 * Cout estime : ~$0.001 par traduction (Haiku 4.5 input + output).
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import type { CampaignActionResult } from './types';

const LOG_PREFIX = '[campaigns/translate]';
const MODEL = 'claude-haiku-4-5-20251001';

const translateSchema = z.object({
  campaign_id: z.string().uuid(),
  source: z.enum(['fr', 'en']),
  target: z.enum(['fr', 'en']),
});

const markManualSchema = z.object({
  campaign_id: z.string().uuid(),
  lang: z.enum(['fr', 'en']),
});

const SYSTEM_PROMPT = `Tu traduis des emails marketing B2B pour MediaDays Solutions, le rendez-vous business de l'audio, la radio et le podcast organisé par les Éditions HF (Brive) à Marseille (10 déc 2026) et Paris (15 déc 2026).

RÈGLES STRICTES :
1. Conserve à l'identique : les balises HTML, les variables {prenom} {societe} {etape}, les noms propres (MediaDays Solutions, Éditions HF, Brive, Marseille, Paris), les URLs, les emails.
2. Conserve le ton professionnel mais chaleureux (registre B2B premium, pas guindé).
3. Conserve les majuscules sur "MediaDays Solutions" (jamais en minuscules).
4. N'invente pas de contenu absent du source.
5. N'ajoute aucun commentaire, préambule ou note de traduction.
6. Réponds UNIQUEMENT en JSON valide : { "subject": "...", "body_html": "..." }`;

export async function translateCampaignAction(
  input: z.input<typeof translateSchema>,
): Promise<
  CampaignActionResult<{ subject: string; body_html: string; model: string; translated_at: string }>
> {
  const profile = await requireAdminProfile();
  if (profile.role === 'sales') {
    return { ok: false, error: 'Seul un admin peut déclencher une traduction IA.' };
  }
  const parsed = translateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  if (parsed.data.source === parsed.data.target) {
    return { ok: false, error: 'Source et cible identiques.' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY missing in env.' };
  }

  const supabase = getSupabaseServiceClient();
  const { data: campaign } = await supabase
    .from('email_campaigns')
    .select('id, subject_fr, body_fr, subject_en, body_en')
    .eq('id', parsed.data.campaign_id)
    .maybeSingle();
  if (!campaign) return { ok: false, error: 'Campagne introuvable.' };

  const sourceSubject = parsed.data.source === 'fr' ? campaign.subject_fr : campaign.subject_en;
  const sourceBody = parsed.data.source === 'fr' ? campaign.body_fr : campaign.body_en;
  if (!sourceSubject || !sourceBody) {
    return { ok: false, error: `La version ${parsed.data.source.toUpperCase()} est vide.` };
  }

  const targetLangName = parsed.data.target === 'fr' ? 'français' : 'anglais';

  // Appel Anthropic.
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
      console.warn('%s no-json-found response=%s', LOG_PREFIX, text.slice(0, 200));
      return { ok: false, error: 'Réponse IA invalide (pas de JSON détecté).' };
    }
    try {
      parsedResponse = JSON.parse(match[0]);
    } catch (err) {
      console.warn(
        '%s json-parse-failed msg=%s',
        LOG_PREFIX,
        err instanceof Error ? err.message : String(err),
      );
      return { ok: false, error: 'Réponse IA non parsable.' };
    }
    if (
      typeof parsedResponse.subject !== 'string' ||
      typeof parsedResponse.body_html !== 'string'
    ) {
      return { ok: false, error: 'Réponse IA incomplète (subject ou body_html manquant).' };
    }
  } catch (err) {
    console.error(
      '%s anthropic-failed msg=%s',
      LOG_PREFIX,
      err instanceof Error ? err.message : String(err),
    );
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Anthropic API error',
    };
  }

  // Save en DB.
  const now = new Date().toISOString();
  const patch =
    parsed.data.target === 'en'
      ? {
          subject_en: parsedResponse.subject,
          body_en: parsedResponse.body_html,
          en_translated_by_ai_at: now,
          translation_model: MODEL,
        }
      : {
          subject_fr: parsedResponse.subject,
          body_fr: parsedResponse.body_html,
          fr_translated_by_ai_at: now,
          translation_model: MODEL,
        };

  const { error } = await supabase
    .from('email_campaigns')
    .update(patch as never)
    .eq('id', parsed.data.campaign_id);
  if (error) {
    return { ok: false, error: `Update DB failed: ${error.message}` };
  }

  // Audit log.
  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      entity_type: 'email_campaigns',
      entity_id: parsed.data.campaign_id,
      action: 'update',
      after: {
        kind: 'campaign_translated_by_ai',
        actor_role: profile.role,
        source: parsed.data.source,
        target: parsed.data.target,
        model: MODEL,
      } as never,
    });
  } catch (err) {
    console.warn(
      '%s audit-log-failed msg=%s',
      LOG_PREFIX,
      err instanceof Error ? err.message : String(err),
    );
  }

  revalidatePath(`/admin/campaigns/${parsed.data.campaign_id}`);
  revalidatePath(`/admin/campaigns/${parsed.data.campaign_id}/edit`);
  return {
    ok: true,
    subject: parsedResponse.subject,
    body_html: parsedResponse.body_html,
    model: MODEL,
    translated_at: now,
  };
}

/**
 * P8.3-quater — reset le flag "traduit par IA" pour une langue.
 *
 * Appelee onBlur du body editor cote UI : si l'admin a edite manuellement,
 * le badge "Traduit par IA — a relire" disparait (le contenu reflete sa
 * relecture editoriale).
 */
export async function markCampaignBodyManuallyEditedAction(
  input: z.input<typeof markManualSchema>,
): Promise<CampaignActionResult> {
  const profile = await requireAdminProfile();
  const parsed = markManualSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const supabase = getSupabaseServiceClient();
  const patch =
    parsed.data.lang === 'en' ? { en_translated_by_ai_at: null } : { fr_translated_by_ai_at: null };
  const { error } = await supabase
    .from('email_campaigns')
    .update(patch as never)
    .eq('id', parsed.data.campaign_id);
  if (error) return { ok: false, error: error.message };
  void profile;
  return { ok: true };
}
