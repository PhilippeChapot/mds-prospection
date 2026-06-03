/**
 * Classification IA d'un signup public via Claude Haiku 4.5.
 *
 * Refacto du POC `scripts/test-ai-classification.ts` (P0 M5) — meme prompt
 * systeme + meme format de sortie, mais on enrichit l'input avec les donnees
 * du formulaire (nom contact, categorie, etc.) car le P3 dispose de plus
 * de contexte qu'un simple lookup company.
 *
 * Returns null en cas d'erreur API/parsing — le caller continue sans
 * classification (ai_classification stocke null en DB).
 */

import Anthropic from '@anthropic-ai/sdk';

export const POLE_CODES = [
  'REGIES_RETAIL_MEDIA',
  'AUDIO_RADIO',
  'DIFFUSION_INFRA',
  'VIDEO_CTV',
  'OUTDOOR_DOOH',
  'DATA_ADTECH',
  'INCONNU',
] as const;
export type PoleCode = (typeof POLE_CODES)[number];

const SYSTEM_PROMPT = `Tu es un classificateur de sociétés pour le salon B2B "MediaDays Solutions 2026" (Carrousel du Louvre, Paris).

Pour chaque société, retourne le pôle thématique parmi :

- REGIES_RETAIL_MEDIA : régies pub, éditeurs, retailers, agences créa, annonceurs, UDECAM
- AUDIO_RADIO : radios diffuseurs, plateformes audio, podcast networks, solutions audio pour radios
- DIFFUSION_INFRA : cloud broadcast, CDN, transport contenu, opérateurs FM/DAB+, infrastructure broadcast
- VIDEO_CTV : distribution vidéo, monétisation CTV, analytics vidéo, production vidéo pro
- OUTDOOR_DOOH : tech DOOH, programmatique outdoor, solutions d'affichage
- DATA_ADTECH : adtech, DSP/SSP, data, mesure d'audience, IA marketing, retail media tech
- INCONNU : société qui ne correspond clairement à aucun pôle ci-dessus

Réponds STRICTEMENT en JSON :
{ "pole_code": "<code>", "confidence": <0..1>, "reasoning": "<une phrase>" }

Sois sévère sur la confiance : ne dépasse 0.7 que si tu es certain.
Dans le doute, retourne "INCONNU" avec confidence = 0.`;

export interface ClassifySignupInput {
  companyName: string;
  companyCountry?: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  category: 'partenaire' | 'partenaire';
  emailDomain?: string | null;
}

export interface ClassifySignupResult {
  poleCode: PoleCode;
  confidence: number;
  reasoning: string;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function isPoleCode(value: unknown): value is PoleCode {
  return typeof value === 'string' && (POLE_CODES as readonly string[]).includes(value);
}

export async function classifySignup(
  input: ClassifySignupInput,
): Promise<ClassifySignupResult | null> {
  const client = getClient();
  if (!client) return null;

  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  const contactName = [input.contactFirstName, input.contactLastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  const userPrompt = `Société : ${input.companyName}
Pays : ${input.companyCountry ?? 'non fourni'}
Contact : ${contactName || 'non fourni'}
Catégorie déclarée : ${input.category}
Domaine email : ${input.emailDomain ?? 'non fourni'}
Site web (déduit) : ${input.emailDomain ? `https://${input.emailDomain}` : 'non fourni'}

Note : utilise tes connaissances générales sur les entreprises médias / broadcast / audio / video pour classer. Si tu connais cette entreprise, utilise ce que tu sais d'elle.`;

  try {
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

    return {
      poleCode: parsed.pole_code,
      confidence,
      reasoning,
      modelUsed: model,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    };
  } catch {
    // On swallow : la classification est best-effort. L'admin pourra reclassifier
    // manuellement depuis /admin/signups/[id].
    return null;
  }
}

/**
 * Extrait le domaine d'un email (lowercase). Retourne null si invalide.
 */
export function extractEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  return email
    .slice(at + 1)
    .toLowerCase()
    .trim();
}
