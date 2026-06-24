/**
 * P5.x.ApolloEnrichFixes — classification d'une société dans un pôle MDS via
 * Claude Haiku 4.5, à partir des données Apollo (industrie, mots-clés, desc).
 *
 * Même liste de pôles + format de sortie que [[classify-signup]] (réutilise
 * POLE_CODES). best-effort : retourne null en cas d'erreur API/parsing.
 * Pas de 'use server' (helper importé par la server action enrich).
 */

import Anthropic from '@anthropic-ai/sdk';
import { POLE_CODES, type PoleCode } from '@/lib/ai/classify-signup';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `Tu es un classificateur de sociétés pour le salon B2B "MediaDays Solutions 2026" (audio, radio, podcast, broadcast, média).

Classe la société dans UN des pôles :
- REGIES_RETAIL_MEDIA : régies pub, éditeurs, retailers, agences créa, annonceurs
- AUDIO_RADIO : radios diffuseurs, plateformes audio, podcast networks, solutions audio
- DIFFUSION_INFRA : cloud broadcast, CDN, transport contenu, opérateurs FM/DAB+, infra broadcast
- VIDEO_CTV : distribution vidéo, monétisation CTV, analytics vidéo, production vidéo pro
- OUTDOOR_DOOH : tech DOOH, programmatique outdoor, solutions d'affichage
- DATA_ADTECH : adtech, DSP/SSP, data, mesure d'audience, IA marketing, retail media tech
- INCONNU : ne correspond clairement à aucun pôle

Réponds STRICTEMENT en JSON :
{ "pole_code": "<code>", "confidence": <0..1>, "reasoning": "<une phrase>" }

Sois sévère : ne dépasse 0.7 que si tu es certain. Dans le doute, "INCONNU" avec confidence = 0.`;

export interface ClassifyCompanyInput {
  name: string;
  industry?: string | null;
  keywords?: string[] | null;
  description?: string | null;
  domain?: string | null;
}

export interface ClassifyCompanyResult {
  poleCode: PoleCode;
  confidence: number;
  reasoning: string;
}

function isPoleCode(v: unknown): v is PoleCode {
  return typeof v === 'string' && (POLE_CODES as readonly string[]).includes(v);
}

export async function classifyCompanyToPole(
  input: ClassifyCompanyInput,
): Promise<ClassifyCompanyResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  const userPrompt = `Société : ${input.name}
Domaine : ${input.domain ?? 'non fourni'}
Industrie Apollo : ${input.industry ?? 'non fourni'}
Mots-clés : ${input.keywords?.length ? input.keywords.slice(0, 20).join(', ') : 'non fourni'}
Description : ${input.description ?? 'non fournie'}

Utilise tes connaissances sur les entreprises médias / broadcast / audio / vidéo / adtech pour classer.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      pole_code?: unknown;
      confidence?: unknown;
      reasoning?: unknown;
    };
    if (!isPoleCode(parsed.pole_code)) return null;
    const confidence =
      typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';
    return { poleCode: parsed.pole_code, confidence, reasoning };
  } catch {
    return null;
  }
}

/** Seuil de confiance au-dessus duquel on attribue le pôle (sinon INCONNU). */
export const POLE_CONFIDENCE_THRESHOLD = 0.7;

/** Code de pôle effectif selon le seuil. */
export function resolvePoleCode(result: ClassifyCompanyResult | null): PoleCode {
  if (!result) return 'INCONNU';
  return result.confidence >= POLE_CONFIDENCE_THRESHOLD ? result.poleCode : 'INCONNU';
}
