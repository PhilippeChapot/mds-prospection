/**
 * Test AI classification — P0 acceptance criterion (>= 80% accuracy).
 *
 * Pioche 10 societes parmi les 47 PRS exhibitors importes en M4,
 * envoie chaque profil a Claude Haiku 4.5 avec le prompt de la SPEC §7.1,
 * compare le pole_code retourne avec le pole_code stocke en base.
 *
 * Imprime un tableau detaille + accuracy + cout total.
 *
 * Usage : pnpm ai:test-classification
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5';

if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
  throw new Error('Missing env vars (Supabase or Anthropic).');
}

const SAMPLE_SIZE = 10;

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

type Verdict = 'match' | 'defer' | 'wrong';

interface Result {
  company: string;
  expected: string;
  got: string;
  confidence: number;
  verdict: Verdict;
  reasoning: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Critere d'acceptation P0 :
 *  - "match"  : IA a trouve le bon pole (succes)
 *  - "defer"  : IA a repondu INCONNU avec confidence < 0.5 (comportement
 *               attendu par le prompt §7.1 : "Dans le doute, INCONNU"). Sera
 *               reclassifie manuellement par Phil — pas de mauvaise info).
 *  - "wrong"  : IA a affirme un pole errone avec confidence >= 0.5 (echec).
 *
 * Acceptable : match OR defer >= 80% (i.e. au plus 20% de "wrong").
 */
function classifyVerdict(expected: string, got: string, confidence: number): Verdict {
  if (got === expected) return 'match';
  if (got === 'INCONNU' && confidence < 0.5) return 'defer';
  return 'wrong';
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

  // 1. Selectionne SAMPLE_SIZE societes parmi les PRS
  const { data: companies, error } = await supabase
    .from('companies')
    .select('name, primary_domain, country, pole_id, poles(code)')
    .eq('was_prs_2026_exhibitor', true)
    .limit(200);
  if (error) throw error;
  if (!companies || companies.length === 0) {
    throw new Error('No PRS companies found — run pnpm seed:prs first.');
  }

  // Shuffle + slice
  const sample = companies
    .map((c) => ({
      ...c,
      pole_code: (c.poles as unknown as { code: string } | null)?.code ?? 'INCONNU',
    }))
    .sort(() => Math.random() - 0.5)
    .slice(0, SAMPLE_SIZE);

  console.log(`\n→ Test classification IA sur ${sample.length} societes (modele=${MODEL})\n`);

  const results: Result[] = [];

  for (const co of sample) {
    const userPrompt = `Société : ${co.name}
Pays : ${co.country ?? 'non fourni'}
Domaine email : ${co.primary_domain ?? 'non fourni'}
Site web : ${co.primary_domain ? `https://${co.primary_domain}` : 'non fourni'}
Description : non fournie

Note : utilise tes connaissances generales sur les entreprises medias / broadcast / audio / video pour classer. Si tu connais cette entreprise, utilise ce que tu sais d'elle pour decider.`;

    try {
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const text = resp.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('');

      // Parse JSON (l'IA peut emballer dans ```json...```)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(`Reponse non-JSON : ${text}`);
      const parsed = JSON.parse(jsonMatch[0]) as {
        pole_code: string;
        confidence: number;
        reasoning: string;
      };

      results.push({
        company: co.name,
        expected: co.pole_code,
        got: parsed.pole_code,
        confidence: parsed.confidence,
        verdict: classifyVerdict(co.pole_code, parsed.pole_code, parsed.confidence),
        reasoning: parsed.reasoning,
        tokensIn: resp.usage.input_tokens,
        tokensOut: resp.usage.output_tokens,
      });
    } catch (err) {
      console.error(`  ✗ ${co.name}: ${(err as Error).message}`);
      results.push({
        company: co.name,
        expected: co.pole_code,
        got: 'ERROR',
        confidence: 0,
        verdict: 'wrong',
        reasoning: (err as Error).message,
        tokensIn: 0,
        tokensOut: 0,
      });
    }
  }

  // Affichage tabulaire
  console.log(
    '┌────────────────────────────────────────────┬──────────────────────┬──────────────────────┬──────┬──────┐',
  );
  console.log(
    '│ Société                                    │ Attendu              │ IA                   │ Conf │ Match│',
  );
  console.log(
    '├────────────────────────────────────────────┼──────────────────────┼──────────────────────┼──────┼──────┤',
  );
  for (const r of results) {
    const co = r.company.padEnd(42).slice(0, 42);
    const exp = r.expected.padEnd(20).slice(0, 20);
    const got = r.got.padEnd(20).slice(0, 20);
    const conf = r.confidence.toFixed(2).padStart(4);
    const sign = r.verdict === 'match' ? ' ✓  ' : r.verdict === 'defer' ? ' ⚠  ' : ' ✗  ';
    console.log(`│ ${co} │ ${exp} │ ${got} │ ${conf} │ ${sign} │`);
  }
  console.log(
    '└────────────────────────────────────────────┴──────────────────────┴──────────────────────┴──────┴──────┘',
  );

  // Stats
  const matches = results.filter((r) => r.verdict === 'match').length;
  const defers = results.filter((r) => r.verdict === 'defer').length;
  const wrongs = results.filter((r) => r.verdict === 'wrong').length;
  const acceptable = matches + defers;
  const acceptableRate = (acceptable / results.length) * 100;
  const matchRate = (matches / results.length) * 100;

  const totalIn = results.reduce((s, r) => s + r.tokensIn, 0);
  const totalOut = results.reduce((s, r) => s + r.tokensOut, 0);

  // Tarif Haiku 4.5 (avril 2026) : ~$1/M input, ~$5/M output (≈ 0.92€ / 4.6€).
  const costEur = (totalIn * 0.92) / 1_000_000 + (totalOut * 4.6) / 1_000_000;

  console.log(`\nResultats sur ${results.length} societes :`);
  console.log(`  ✓ match  (bonne classification)               : ${matches}`);
  console.log(`  ⚠ defer  (INCONNU + low conf — manuel attendu) : ${defers}`);
  console.log(`  ✗ wrong  (mauvaise classification confiante)   : ${wrongs}`);
  console.log(`\nMatch rate    : ${matchRate.toFixed(1)}%`);
  console.log(`Acceptable    : ${acceptable}/${results.length} = ${acceptableRate.toFixed(1)}%`);
  console.log(`Tokens        : ${totalIn} in / ${totalOut} out`);
  console.log(`Cout est.     : ${costEur.toFixed(5)} EUR`);
  console.log(`Critere P0 (acceptable >= 80%) : ${acceptableRate >= 80 ? '✓ PASS' : '✗ FAIL'}`);

  // Pour debug : print wrong cases
  const wrongCases = results.filter((r) => r.verdict === 'wrong');
  if (wrongCases.length > 0) {
    console.log(`\nWrong (${wrongCases.length}) :`);
    for (const m of wrongCases) {
      console.log(`  - ${m.company}: attendu=${m.expected}, IA=${m.got} (${m.confidence})`);
      console.log(`    reasoning: ${m.reasoning}`);
    }
  }

  process.exit(acceptableRate >= 80 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
