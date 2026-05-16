/**
 * P6.x.4-a — parse src/data/mds-taxonomy.md → src/data/mds-taxonomy.json
 *
 * Source de vérité : COWORK/MDS2026-Reference-Maitre.md (v2.1), copié
 * dans src/data/mds-taxonomy.md à chaque update officiel.
 *
 * Le JSON généré alimente la landing publique (PolesExplorer +
 * VisitorFamiliesExplorer) et les futures milestones (Smart Search,
 * Matchmaking clients).
 *
 * Run :  pnpm build:taxonomy
 *
 * Idempotent : ré-exécutable. Écrit toujours le même JSON à partir du
 * même markdown (sauf changements dans la source).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');

interface PoleSubSector {
  name: string;
  count: number;
  exemples: string[];
}

interface Pole {
  code: string;
  name: string;
  emoji: string;
  color: string;
  category: 'mediadays_classique' | 'mediadays_solutions';
  sub_label: string | null;
  zone: string | null;
  description: string;
  sous_secteurs: PoleSubSector[];
  total_sous_secteurs: number;
  total_exposants_cibles: number;
}

interface VisitorFamily {
  id: number;
  name: string;
  count: number;
  affinite_poles: string[];
  affinite_levels: number[];
  exemples: string[];
  fonctions: string;
  action_landing: 'visiteur_gratuit' | 'institutionnel_form' | 'ecole_form';
}

interface Taxonomy {
  version: string;
  generated_at: string;
  poles: Pole[];
  visiteurs: VisitorFamily[];
  stats: {
    total_poles: number;
    total_sous_secteurs: number;
    total_exposants_cibles: number;
    total_visiteurs_families: number;
    total_visiteurs_entites: number;
  };
}

// Métadonnées figées (couleur, emoji, code, classification) — copiées
// du tableau "Taxonomie officielle figée" du markdown.
const POLE_META: Record<
  string,
  {
    code: string;
    name: string;
    emoji: string;
    color: string;
    category: 'mediadays_classique' | 'mediadays_solutions';
    sub_label: string | null;
  }
> = {
  'RÉGIES & RETAIL MEDIA': {
    code: 'REGIES_RETAIL_MEDIA',
    name: 'RÉGIES & RETAIL MEDIA',
    emoji: '🏛️',
    color: '#FFCDD2',
    category: 'mediadays_classique',
    sub_label: null,
  },
  'AUDIO & RADIO': {
    code: 'AUDIO_RADIO',
    name: 'AUDIO & RADIO',
    emoji: '🎙️',
    color: '#F8BBD0',
    category: 'mediadays_solutions',
    sub_label: 'Paris Radio Show',
  },
  'DIFFUSION & INFRA': {
    code: 'DIFFUSION_INFRA',
    name: 'DIFFUSION & INFRA',
    emoji: '📡',
    color: '#E1BEE7',
    category: 'mediadays_solutions',
    sub_label: null,
  },
  'VIDÉO & CTV': {
    code: 'VIDEO_CTV',
    name: 'VIDÉO & CTV',
    emoji: '🎥',
    color: '#BBDEFB',
    category: 'mediadays_solutions',
    sub_label: null,
  },
  'OUTDOOR & DOOH': {
    code: 'OUTDOOR_DOOH',
    name: 'OUTDOOR & DOOH',
    emoji: '📢',
    color: '#FFE0B2',
    category: 'mediadays_solutions',
    sub_label: null,
  },
  'DATA & ADTECH': {
    code: 'DATA_ADTECH',
    name: 'DATA & ADTECH',
    emoji: '📊',
    color: '#C8E6C9',
    category: 'mediadays_solutions',
    sub_label: null,
  },
};

// Familles 11 (Institutionnels) et 13 (Écoles) → action dédiée
const SPECIAL_FAMILY_ACTIONS: Record<number, VisitorFamily['action_landing']> = {
  11: 'institutionnel_form',
  13: 'ecole_form',
};

/** Strip emoji + decorations + markdown bold from "**🏛️ RÉGIES & RETAIL MEDIA ⭐**" → "RÉGIES & RETAIL MEDIA". */
function normalizePoleHeading(raw: string): string {
  return raw
    .replace(/\*\*/g, '')
    .replace(/[🏛️🎙️📡🎥📢📊⭐🔥]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "RÉGIES & RETAIL MEDIA ⚫⚫ · DATA & ADTECH ⚫" → [{code, level}, ...] */
function parseAffinity(text: string): { codes: string[]; levels: number[] } {
  const codes: string[] = [];
  const levels: number[] = [];
  // Split on " · " but keep the dot count on each segment
  const segments = text.split(/\s*·\s*/);
  for (const seg of segments) {
    const dots = (seg.match(/⚫/g) ?? []).length;
    if (dots === 0) continue;
    const nameOnly = normalizePoleHeading(
      seg.replace(/⚫/g, '').replace(/tous pôles|toutes zones/i, ''),
    );
    if (!nameOnly) continue;
    const meta = POLE_META[nameOnly];
    if (meta) {
      codes.push(meta.code);
      levels.push(dots);
    }
  }
  return { codes, levels };
}

function parseSubSector(line: string): PoleSubSector | null {
  // Format: "- **Régies TV** (6) — TF1 Pub · M6 Publicité · ..."
  const m = line.match(/^-\s+\*\*(.+?)\*\*\s+\((\d+)\)\s+—\s+(.+)$/);
  if (!m) return null;
  const [, name, countStr, exemplesStr] = m;
  // Exemples séparés par " · " ; filtre les " + N" décoratifs
  const exemples = exemplesStr
    .split(/\s*·\s*/)
    .map((e) => e.replace(/\s+🌍.*$/u, '').trim())
    .filter((e) => e && !/^\+\s*\d+$/.test(e));
  return {
    name: name.trim(),
    count: Number(countStr),
    exemples,
  };
}

function parsePoles(md: string): Pole[] {
  const poles: Pole[] = [];
  // Sections de pôle commencent par "## " avec un emoji référencé (les autres ## comme "Plan des salles" sont skippés)
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (!headingMatch) {
      i++;
      continue;
    }
    const heading = normalizePoleHeading(headingMatch[1]);
    const meta = POLE_META[heading];
    if (!meta) {
      i++;
      continue;
    }

    // Description = 1er paragraphe en gras au début de la section
    let description = '';
    let zone: string | null = null;
    let totalSubSectorsStated = 0;
    let totalExposantsStated = 0;

    i++;
    while (i < lines.length && !lines[i].startsWith('##') && !lines[i].startsWith('- **')) {
      const l = lines[i].trim();
      if (l.startsWith('**')) {
        // Soit la description "**Offre média** : ..." (1ère), soit zone "**Zone principale** : ..."
        if (l.includes('Zone principale') && !zone) {
          zone = l.replace(/^\*\*Zone principale\*\*\s*:\s*/, '').trim();
        } else if (!description) {
          // Premier paragraphe gras = description courte (retire le markdown bold)
          description = l.replace(/\*\*/g, '');
        }
      } else if (l && !description && !l.startsWith('|')) {
        // Fallback : description = 1er paragraphe non vide
        description = l;
      }
      // "**N sous-secteurs · M exposants cibles**"
      const totals = l.match(/\*\*(\d+)\s+sous-secteurs?\s*·\s*(\d+)\s+exposants?\s+cibles?\*\*/);
      if (totals) {
        totalSubSectorsStated = Number(totals[1]);
        totalExposantsStated = Number(totals[2]);
      }
      i++;
    }

    // Sous-secteurs : lignes "- **...** (N) — ..."
    const sousSecteurs: PoleSubSector[] = [];
    while (i < lines.length && !lines[i].startsWith('## ')) {
      const ss = parseSubSector(lines[i]);
      if (ss) sousSecteurs.push(ss);
      i++;
    }

    poles.push({
      ...meta,
      zone,
      description,
      sous_secteurs: sousSecteurs,
      total_sous_secteurs: totalSubSectorsStated || sousSecteurs.length,
      total_exposants_cibles:
        totalExposantsStated || sousSecteurs.reduce((sum, s) => sum + s.count, 0),
    });
  }
  return poles;
}

function parseVisitorFamilies(md: string): VisitorFamily[] {
  const families: VisitorFamily[] = [];
  // Sections "### N. Nom (count) — affinité ..." + ligne exemples + "**Fonctions visées** : ..."
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^###\s+(\d+)\.\s+(.+?)\s+\((\d+)\)\s+—\s+(.+)$/);
    if (!m) {
      i++;
      continue;
    }
    const [, idStr, name, countStr, affinityRaw] = m;
    const id = Number(idStr);
    // Affinité : retire "affinité " prefix et "stand gracieux ..."/"accès gracieux ..." trailing
    let affinityText = affinityRaw.replace(/^affinité\s+/i, '').trim();
    if (!affinityText.includes('⚫')) {
      // Familles 11/12/13 : pas d'affinité, juste un libellé "stand gracieux", "accès gracieux"
      affinityText = '';
    }
    const { codes, levels } = parseAffinity(affinityText);

    // Ligne suivante = exemples (séparés par " · ")
    let exemples: string[] = [];
    let fonctions = '';
    i++;
    while (i < lines.length && !lines[i].startsWith('### ') && !lines[i].startsWith('## ')) {
      const l = lines[i].trim();
      if (l.startsWith('**Fonctions visées**')) {
        fonctions = l.replace(/^\*\*Fonctions visées\*\*\s*:\s*/, '').trim();
      } else if (l && exemples.length === 0 && !l.startsWith('**')) {
        exemples = l
          .split(/\s*·\s*/)
          .map((e) => e.trim())
          .filter((e) => e && !/^\+\s*\d+$/.test(e));
      }
      i++;
    }

    families.push({
      id,
      name: name.trim(),
      count: Number(countStr),
      affinite_poles: codes,
      affinite_levels: levels,
      exemples,
      fonctions,
      action_landing: SPECIAL_FAMILY_ACTIONS[id] ?? 'visiteur_gratuit',
    });
  }
  return families;
}

function build(): Taxonomy {
  const mdPath = path.join(projectRoot, 'src/data/mds-taxonomy.md');
  const md = readFileSync(mdPath, 'utf-8');
  const poles = parsePoles(md);
  const visiteurs = parseVisitorFamilies(md);

  if (poles.length !== 6) {
    throw new Error(`Expected 6 pôles, parsed ${poles.length}`);
  }
  if (visiteurs.length !== 14) {
    throw new Error(`Expected 14 visitor families, parsed ${visiteurs.length}`);
  }

  const totalSubSectors = poles.reduce((sum, p) => sum + p.total_sous_secteurs, 0);
  const totalExposants = poles.reduce((sum, p) => sum + p.total_exposants_cibles, 0);
  const totalVisitorEntities = visiteurs.reduce((sum, v) => sum + v.count, 0);

  return {
    version: '2.1',
    generated_at: new Date().toISOString(),
    poles,
    visiteurs,
    stats: {
      total_poles: poles.length,
      total_sous_secteurs: totalSubSectors,
      total_exposants_cibles: totalExposants,
      total_visiteurs_families: visiteurs.length,
      total_visiteurs_entites: totalVisitorEntities,
    },
  };
}

function main() {
  const taxonomy = build();
  const outPath = path.join(projectRoot, 'src/data/mds-taxonomy.json');
  writeFileSync(outPath, JSON.stringify(taxonomy, null, 2) + '\n', 'utf-8');
  console.log(
    `✓ Wrote ${outPath} — ${taxonomy.poles.length} pôles · ${taxonomy.stats.total_sous_secteurs} sous-secteurs · ${taxonomy.stats.total_exposants_cibles} exposants · ${taxonomy.visiteurs.length} familles visiteurs (${taxonomy.stats.total_visiteurs_entites} entités).`,
  );
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('build-mds-taxonomy.ts');
if (isDirectRun) {
  main();
}

export { build, parsePoles, parseVisitorFamilies, parseAffinity };
export type { Taxonomy, Pole, PoleSubSector, VisitorFamily };
