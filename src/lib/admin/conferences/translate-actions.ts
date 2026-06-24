'use server';

/**
 * P16.x.ConferencesKeyFigures — traduction FR→EN des conférences via Claude
 * Haiku 4.5 (titre, description, public cible, chiffres clés).
 *
 * RBAC : admin / super_admin (pas sales — dépense Anthropic).
 * Parse JSON robuste (regex {...}). Préserve acronymes métier audio/radio/
 * podcast (CTV, FAST, DAB+, AVOD, SSP/DSP, AM/FM…) + chiffres/unités.
 *
 * target_audience_* / key_figures_* pas encore dans les types générés
 * (migrations 0104/0105) → service client casté pour ces colonnes.
 *
 * Note 'use server' : exporte uniquement des fonctions async.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { type SupabaseClient } from '@supabase/supabase-js';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[conferences/translate]';
const MODEL = 'claude-haiku-4-5-20251001';

const asAnyDb = (c: ReturnType<typeof getSupabaseServiceClient>): SupabaseClient =>
  c as unknown as SupabaseClient;

const SYSTEM_PROMPT = `You translate FR→EN conference programme content for MediaDays Solutions & Paris Radio Show 2026, B2B events about audio, radio, podcast, broadcast & media tech.

STRICT RULES:
1. Keep numbers, percentages and units EXACTLY as written (e.g. "4,18 Mds$", "+34 %", "318 M€") — do not convert or reformat.
2. Preserve industry acronyms and product names verbatim: CTV, FAST, AVOD, SVOD, DAB+, AM/FM, SSP, DSP, OOH/DOOH, AIGC, ST 2110, GAFAM, IAB, plus brand/proper nouns (MediaDays Solutions, Paris Radio Show, YouTube, etc.).
3. Natural professional English, no fluff, no added content.
4. Translate "IA" → "AI".
5. Respond ONLY with valid JSON, no preamble, no markdown fences.`;

const translateSchema = z.object({ conference_id: z.string().uuid() });

type TranslateResult = { ok: true } | { ok: false; error: string };

interface AiTranslation {
  title_en: string;
  description_en: string | null;
  target_audience_en: string | null;
  key_figures_en: string[];
}

async function translateOne(conferenceId: string, actorId: string): Promise<TranslateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY manquant.' };

  const supabase = getSupabaseServiceClient();
  const { data: conf } = await asAnyDb(supabase)
    .from('conferences')
    .select('id, title_fr, description_fr, target_audience_fr, key_figures_fr')
    .eq('id', conferenceId)
    .maybeSingle();
  if (!conf) return { ok: false, error: 'Conférence introuvable.' };

  const row = conf as Record<string, unknown>;
  const source = {
    title_fr: (row.title_fr as string) ?? '',
    description_fr: (row.description_fr as string | null) ?? null,
    target_audience_fr: (row.target_audience_fr as string | null) ?? null,
    key_figures_fr: (row.key_figures_fr as string[] | null) ?? [],
  };

  let ai: AiTranslation;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Translate to English. Respond as JSON:
{ "title_en": "...", "description_en": "...", "target_audience_en": "...", "key_figures_en": ["..."] }

title_fr: ${JSON.stringify(source.title_fr)}
description_fr: ${JSON.stringify(source.description_fr)}
target_audience_fr: ${JSON.stringify(source.target_audience_fr)}
key_figures_fr: ${JSON.stringify(source.key_figures_fr)}`,
        },
      ],
    });
    const block = response.content[0];
    const text = block?.type === 'text' ? block.text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn('%s no-json conf=%s', LOG_PREFIX, conferenceId);
      return { ok: false, error: 'Réponse IA invalide (pas de JSON).' };
    }
    ai = JSON.parse(match[0]) as AiTranslation;
    if (typeof ai.title_en !== 'string') {
      return { ok: false, error: 'Réponse IA incomplète (title_en).' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s anthropic-failed conf=%s msg=%s', LOG_PREFIX, conferenceId, msg);
    return { ok: false, error: msg };
  }

  const now = new Date().toISOString();
  const { error } = await asAnyDb(supabase)
    .from('conferences')
    .update({
      title_en: ai.title_en,
      description_en: ai.description_en ?? null,
      target_audience_en: ai.target_audience_en ?? null,
      key_figures_en: Array.isArray(ai.key_figures_en) ? ai.key_figures_en.slice(0, 5) : null,
      updated_at: now,
    })
    .eq('id', conferenceId);
  if (error) return { ok: false, error: `Update DB: ${error.message}` };

  await supabase.from('audit_log').insert({
    user_id: actorId,
    action: 'update',
    entity_type: 'conferences',
    entity_id: conferenceId,
    after: { kind: 'conference_translated_by_ai', model: MODEL } as never,
  });

  return { ok: true };
}

/**
 * P16.x — traduit UN seul champ (bouton inline). Traduit la valeur FR fournie
 * (celle à l'écran, éventuellement non sauvegardée) et renvoie la version EN
 * au client, qui remplit le champ EN. Pas d'écriture DB ici (Save s'en charge).
 */
const fieldSchema = z.object({
  field: z.enum(['title', 'description', 'target_audience', 'key_figures']),
  source_text: z.string().max(4000).optional(),
  source_list: z.array(z.string().max(200)).max(5).optional(),
});

export async function translateConferenceFieldAction(
  input: z.input<typeof fieldSchema>,
): Promise<{ ok: true; text?: string; list?: string[] } | { ok: false; error: string }> {
  const profile = await requireAdminProfile();
  if (profile.role === 'sales') {
    return { ok: false, error: 'Seul un admin peut déclencher une traduction IA.' };
  }
  const parsed = fieldSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Paramètres invalides' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY manquant.' };

  const isList = parsed.data.field === 'key_figures';
  const source = isList ? (parsed.data.source_list ?? []) : (parsed.data.source_text ?? '');
  if ((isList && (source as string[]).length === 0) || (!isList && !(source as string))) {
    return { ok: false, error: 'Champ source FR vide.' };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: isList
            ? `Translate each item to English. Respond as JSON: { "list": ["..."] }\n${JSON.stringify(source)}`
            : `Translate to English. Respond as JSON: { "text": "..." }\n${JSON.stringify(source)}`,
        },
      ],
    });
    const block = response.content[0];
    const text = block?.type === 'text' ? block.text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: 'Réponse IA invalide (pas de JSON).' };
    const json = JSON.parse(match[0]) as { text?: string; list?: string[] };
    if (isList) {
      if (!Array.isArray(json.list)) return { ok: false, error: 'Réponse IA: list manquante.' };
      return { ok: true, list: json.list.slice(0, 5) };
    }
    if (typeof json.text !== 'string') return { ok: false, error: 'Réponse IA: text manquant.' };
    return { ok: true, text: json.text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s field-translate-failed field=%s msg=%s', LOG_PREFIX, parsed.data.field, msg);
    return { ok: false, error: msg };
  }
}

export async function translateConferenceAction(input: {
  conference_id: string;
}): Promise<TranslateResult> {
  const profile = await requireAdminProfile();
  if (profile.role === 'sales') {
    return { ok: false, error: 'Seul un admin peut déclencher une traduction IA.' };
  }
  const parsed = translateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'conference_id invalide' };

  const r = await translateOne(parsed.data.conference_id, profile.id);
  revalidatePath(`/admin/conferences/${parsed.data.conference_id}`);
  revalidatePath('/admin/conferences');
  return r;
}

export async function translateAllPendingConferencesAction(): Promise<
  { ok: true; translated: number; failed: number } | { ok: false; error: string }
> {
  const profile = await requireAdminProfile();
  if (profile.role === 'sales') {
    return { ok: false, error: 'Seul un admin peut déclencher une traduction IA.' };
  }

  const supabase = getSupabaseServiceClient();
  // « Pending » = pas encore de titre EN (proxy simple : à retraduire).
  const { data: rows } = await asAnyDb(supabase)
    .from('conferences')
    .select('id, title_en')
    .or('title_en.is.null,title_en.eq.');
  const ids = (rows ?? [])
    .filter((r) => !(r as Record<string, unknown>).title_en)
    .map((r) => (r as Record<string, unknown>).id as string);

  let translated = 0;
  let failed = 0;
  for (const id of ids) {
    const r = await translateOne(id, profile.id);
    if (r.ok) translated += 1;
    else failed += 1;
  }

  revalidatePath('/admin/conferences');
  return { ok: true, translated, failed };
}

// ---------------------------------------------------------------------------
// P16.x.GenerateTargetAudienceHaiku — génération du public cible (FR) pour les
// conférences sans section « Public visé » dans le DOCX (cas PRS).
// ---------------------------------------------------------------------------

const GEN_AUDIENCE_SYSTEM = `Tu génères le PUBLIC CIBLE d'une conférence B2B des secteurs audio, radio, podcast, broadcast et média (MediaDays Solutions / Paris Radio Show 2026).

À partir du titre et de la description, déduis 2 à 4 profils de décisionnaires concernés.

RÈGLES STRICTES :
1. Réponds UNIQUEMENT avec la liste des profils, séparés par " · " (espace point-médian espace).
2. AUCUN préambule, AUCune phrase d'intro, AUCUN guillemet, AUCun point final.
3. Profils concrets et orientés métier (ex: "Directeurs d'antenne", "Responsables programmation", "Régies publicitaires radio", "Éditeurs de podcasts").
4. Français.
Exemple de réponse : Directeurs d'antenne · Responsables programmation · Régies radio · Producteurs de podcasts`;

const genSchema = z.object({ conference_id: z.string().uuid() });

/** Nettoie un éventuel préambule renvoyé par Haiku ("Public cible : ...", etc.). */
function stripAudiencePreamble(raw: string): string {
  let s = raw.trim();
  // Retire fences markdown éventuelles.
  s = s
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  // Garde la 1re ligne non vide (la liste).
  s =
    s
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? s;
  // Retire un label de tête type "Public cible :", "Cible :", "Target:".
  s = s.replace(/^(public\s*cible|cible|target(\s*audience)?|audience)\s*[:\-—]\s*/i, '');
  // Retire guillemets englobants et point final.
  s = s.replace(/^["«»“”']+|["«»“”']+$/g, '').trim();
  s = s.replace(/[.\s]+$/g, '').trim();
  return s.slice(0, 2000);
}

async function generateAudienceFor(
  conferenceId: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY manquant.' };

  const supabase = getSupabaseServiceClient();
  const { data: conf } = await supabase
    .from('conferences')
    .select('id, title_fr, description_fr')
    .eq('id', conferenceId)
    .maybeSingle();
  if (!conf) return { ok: false, error: 'Conférence introuvable.' };

  const title = (conf.title_fr as string) ?? '';
  const description = (conf.description_fr as string | null) ?? '';
  if (!description.trim()) {
    return {
      ok: false,
      error: 'Renseigner d’abord la description (FR) pour générer le public cible.',
    };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: GEN_AUDIENCE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Titre : ${title}\n\nDescription : ${description}\n\nPublic cible (liste " · ") :`,
        },
      ],
    });
    const block = response.content[0];
    const text = block?.type === 'text' ? block.text : '';
    const cleaned = stripAudiencePreamble(text);
    if (!cleaned) return { ok: false, error: 'Réponse IA vide.' };
    return { ok: true, text: cleaned };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s gen-audience-failed conf=%s msg=%s', LOG_PREFIX, conferenceId, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Génère le public cible FR d'une conférence (bouton inline). NE SAUVE PAS :
 * renvoie le texte au client qui remplit le champ FR (révision puis Save).
 */
export async function generateConferenceTargetAudienceAction(
  input: z.input<typeof genSchema>,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const profile = await requireAdminProfile();
  if (profile.role === 'sales') {
    return { ok: false, error: 'Seul un admin peut déclencher une génération IA.' };
  }
  const parsed = genSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'conference_id invalide' };
  return generateAudienceFor(parsed.data.conference_id);
}

/**
 * Génère + SAUVE le public cible FR pour toutes les conférences sans public
 * cible (cas PRS). Super_admin uniquement. Délai 500 ms entre appels Haiku.
 */
export async function generateAllMissingTargetAudienceAction(): Promise<
  { ok: true; generated: number; failed: number } | { ok: false; error: string }
> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'super_admin') {
    return { ok: false, error: 'Réservé au super_admin (génération IA en masse).' };
  }

  const supabase = getSupabaseServiceClient();
  const { data: rows } = await asAnyDb(supabase)
    .from('conferences')
    .select('id, target_audience_fr, description_fr')
    .or('target_audience_fr.is.null,target_audience_fr.eq.');
  const ids = (rows ?? [])
    .filter((r) => {
      const row = r as Record<string, unknown>;
      const ta = (row.target_audience_fr as string | null) ?? '';
      return !ta.trim();
    })
    .map((r) => (r as Record<string, unknown>).id as string);

  let generated = 0;
  let failed = 0;
  for (const id of ids) {
    const r = await generateAudienceFor(id);
    if (!r.ok) {
      failed += 1;
      continue;
    }
    const now = new Date().toISOString();
    const { error } = await asAnyDb(supabase)
      .from('conferences')
      .update({ target_audience_fr: r.text, updated_at: now })
      .eq('id', id);
    if (error) {
      failed += 1;
    } else {
      generated += 1;
      await supabase.from('audit_log').insert({
        user_id: profile.id,
        action: 'update',
        entity_type: 'conferences',
        entity_id: id,
        after: { kind: 'target_audience_generated_by_ai', model: MODEL } as never,
      });
    }
    // Délai entre appels (coût/rate-limit) — sauf après le dernier.
    await new Promise((res) => setTimeout(res, 500));
  }

  revalidatePath('/admin/conferences');
  return { ok: true, generated, failed };
}
