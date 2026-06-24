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
