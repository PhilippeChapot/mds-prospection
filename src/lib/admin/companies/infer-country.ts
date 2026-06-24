/**
 * P5.x.InferMissingCountry — inférence du pays (ISO 3166-1 alpha-2) d'une
 * société via Claude Haiku 4.5, à partir des signaux disponibles (domaine,
 * ville, adresse, industrie…). Best-effort : null en cas d'erreur/parsing.
 *
 * Le backfill SQL de la migration 0110 a passé à NULL les pays dont le nom
 * complet n'était pas dans la liste mappée → on les ré-infère via IA.
 */

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/** Seuil de confiance au-dessus duquel on applique l'inférence. */
export const COUNTRY_CONFIDENCE_THRESHOLD = 0.7;
/** Sentinelle "indéterminable" renvoyée par le modèle. */
export const UNKNOWN_ISO = 'XX';

export interface InferCountryInput {
  name: string;
  primaryDomain?: string | null;
  website?: string | null;
  city?: string | null;
  rawAddress?: string | null;
  industry?: string | null;
  keywords?: string[] | null;
  description?: string | null;
}

export interface InferCountryResult {
  iso2: string; // 2 lettres uppercase (ou 'XX' si indéterminable)
  confidence: number;
  reasoning: string;
}

const SYSTEM_PROMPT = `Tu es un expert en data B2B internationale. Identifie le pays (code ISO 3166-1 alpha-2, 2 lettres MAJUSCULES) où la société est basée.

Indices :
- Domaine .fr / .paris → souvent FR ; .de → DE ; .co.uk / .uk → GB ; .be → BE ; .ch → CH ; .es → ES ; .it → IT
- Domaine .com → ambigu (regarder les autres signaux)
- Ville Paris/Lyon/Marseille/Bordeaux → FR ; Berlin/Munich → DE ; Londres/Manchester → GB ; New York/SF/LA → US

Réponds STRICTEMENT en JSON valide (rien d'autre, pas de markdown) :
{ "iso_2": "<ISO 2 majuscules>", "confidence": <0..1>, "reasoning": "<une phrase>" }

Si vraiment indéterminable : { "iso_2": "XX", "confidence": 0.0, "reasoning": "..." }.`;

export async function inferCompanyCountry(
  input: InferCountryInput,
): Promise<InferCountryResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  const userPrompt = `Société :
- Nom : ${input.name}
- Domaine : ${input.primaryDomain || 'N/A'}
- Site web : ${input.website || 'N/A'}
- Ville : ${input.city || 'N/A'}
- Adresse : ${input.rawAddress || 'N/A'}
- Industrie : ${input.industry || 'N/A'}
- Mots-clés : ${input.keywords?.length ? input.keywords.slice(0, 20).join(', ') : 'N/A'}
- Description : ${input.description || 'N/A'}`;

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
      iso_2?: unknown;
      confidence?: unknown;
      reasoning?: unknown;
    };
    const iso2 = typeof parsed.iso_2 === 'string' ? parsed.iso_2.trim().toUpperCase() : '';
    if (!/^[A-Z]{2}$/.test(iso2)) return null; // format invalide (≠ 2 lettres)
    const confidence =
      typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';
    return { iso2, confidence, reasoning };
  } catch {
    return null;
  }
}

/** Décide si l'inférence est exploitable (seuil + pas la sentinelle XX). */
export function shouldApplyInferredCountry(result: InferCountryResult | null): boolean {
  if (!result) return false;
  return (
    result.confidence >= COUNTRY_CONFIDENCE_THRESHOLD &&
    result.iso2 !== UNKNOWN_ISO &&
    /^[A-Z]{2}$/.test(result.iso2)
  );
}
