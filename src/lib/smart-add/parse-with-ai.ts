/**
 * P5.x.23 — Smart Add Wizard : extraction structurée d'un texte brut via Claude Haiku 4.5.
 *
 * Calque le pattern de `lib/ai/classify-signup.ts` (prompt + regex JSON
 * extraction) pour cohérence avec le reste du codebase.
 *
 * Input typique :
 *   - Signature email
 *   - Profil LinkedIn copié
 *   - Page web copiée
 *   - Mail reçu
 *
 * Output : { person, company, confidence, notes }. Champs null si non extraits
 * (NE JAMAIS inventer). Le caller fait ensuite le matching DB + INSEE.
 *
 * Best-effort : retourne null si erreur API ou JSON invalide (le caller
 * affiche une erreur générique à Phil).
 */

import Anthropic from '@anthropic-ai/sdk';
import { POLE_CODES, type PoleCode } from '@/lib/ai/classify-signup';

const LOG_PREFIX = '[smart-add/parse]';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_INPUT_CHARS = 8000;

export interface ParsedPerson {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  linkedin_url: string | null;
}

export interface ParsedCompany {
  name: string | null;
  website: string | null;
  country: string | null;
  primary_domain: string | null;
  description: string | null;
  suggested_pole: PoleCode;
}

export interface ParsedSmartAdd {
  person: ParsedPerson;
  company: ParsedCompany;
  confidence: 'low' | 'medium' | 'high';
  notes: string | null;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
}

const SYSTEM_PROMPT = `Tu es un assistant de qualification de prospects pour MediaDays Solutions, un événement professionnel B2B dans le secteur audio/radio/podcast/vidéo/diffusion en France.

À partir d'un texte brut (mail, signature email, profil LinkedIn, page web, etc.), extrais les informations suivantes au format JSON strict :

{
  "person": {
    "first_name": "string | null",
    "last_name": "string | null",
    "email": "string | null",
    "phone": "string | null",
    "role": "string | null",
    "linkedin_url": "string | null"
  },
  "company": {
    "name": "string | null",
    "website": "string | null",
    "country": "string | null",
    "primary_domain": "string | null",
    "description": "string | null",
    "suggested_pole": "AUDIO_RADIO | VIDEO_CTV | REGIES_RETAIL_MEDIA | DIFFUSION_INFRA | DATA_ADTECH | OUTDOOR_DOOH | INCONNU"
  },
  "confidence": "low | medium | high",
  "notes": "string | null"
}

Pôles thématiques pour suggested_pole :
- AUDIO_RADIO : radios, podcasts, plateformes audio, broadcast audio
- VIDEO_CTV : distribution vidéo, CTV, production vidéo pro
- REGIES_RETAIL_MEDIA : régies pub, éditeurs, retailers, agences créa
- DIFFUSION_INFRA : cloud broadcast, CDN, infrastructure broadcast
- DATA_ADTECH : adtech, DSP/SSP, data, mesure d'audience, IA marketing
- OUTDOOR_DOOH : tech DOOH, affichage extérieur
- INCONNU : si tu ne peux pas trancher

Règles strictes :
- Si une info est absente du texte, mets null. NE JAMAIS inventer.
- country = code ISO 3166-1 alpha-2 (FR, DE, US, GB, etc.) ou null.
- primary_domain = domaine racine sans préfixe https:// ni chemin (ex: "acme.com").
- Réponds UNIQUEMENT le JSON, sans markdown, sans fences de code.`;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function isPoleCode(value: unknown): value is PoleCode {
  return typeof value === 'string' && (POLE_CODES as readonly string[]).includes(value);
}

function isConfidence(value: unknown): value is 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high';
}

function asStringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

/**
 * Extrait person + company depuis un texte brut. Retourne null si l'API
 * échoue ou si la réponse n'est pas du JSON valide.
 */
export async function parseInputWithAI(rawInput: string): Promise<ParsedSmartAdd | null> {
  const client = getClient();
  if (!client) {
    console.warn('%s skip-no-api-key', LOG_PREFIX);
    return null;
  }

  const input = rawInput.slice(0, MAX_INPUT_CHARS);
  if (input.trim().length === 0) return null;

  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: input }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('%s no-json-in-response text=%s', LOG_PREFIX, text.slice(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const personRaw = (parsed.person as Record<string, unknown>) ?? {};
    const companyRaw = (parsed.company as Record<string, unknown>) ?? {};

    const suggestedPole = isPoleCode(companyRaw.suggested_pole)
      ? (companyRaw.suggested_pole as PoleCode)
      : 'INCONNU';

    const confidence = isConfidence(parsed.confidence) ? parsed.confidence : 'low';

    return {
      person: {
        first_name: asStringOrNull(personRaw.first_name),
        last_name: asStringOrNull(personRaw.last_name),
        email: asStringOrNull(personRaw.email)?.toLowerCase() ?? null,
        phone: asStringOrNull(personRaw.phone),
        role: asStringOrNull(personRaw.role),
        linkedin_url: asStringOrNull(personRaw.linkedin_url),
      },
      company: {
        name: asStringOrNull(companyRaw.name),
        website: asStringOrNull(companyRaw.website),
        country: asStringOrNull(companyRaw.country)?.toUpperCase() ?? null,
        primary_domain: asStringOrNull(companyRaw.primary_domain)?.toLowerCase() ?? null,
        description: asStringOrNull(companyRaw.description),
        suggested_pole: suggestedPole,
      },
      confidence,
      notes: asStringOrNull(parsed.notes),
      modelUsed: model,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    };
  } catch (err) {
    console.error(
      '%s api-error msg=%s',
      LOG_PREFIX,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
