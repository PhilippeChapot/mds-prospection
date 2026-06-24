/**
 * P16.x.ImportPrograms — parsing PUR des programmes DOCX (texte → structures).
 * Aucune dépendance DB : testable unitairement. Le script appelle ces fonctions
 * puis fait l'upsert via import-helpers.
 *
 * Structure des 2 DOCX (MDS + PRS) :
 *   - conférences : entêtes `T1.` … `T10.`
 *   - pitch : ligne `PITCH` (MDS) puis paragraphe, OU `Pitch — …` (PRS)
 *   - speakers : section `INTERVENANTS PRESSENTIS` (MDS) / `Speakers pressentis` (PRS)
 *     lignes `Prénom NOM (Org) — desc` (personne) ou org-only / génériques.
 */
import type { PoleCode } from '@/lib/design-tokens';

export type ParsedSpeaker = {
  kind: 'person' | 'org';
  /** Nom affiché (personne) ou organisation (org). */
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  org: string;
  role: string | null;
};

export type ParsedConference = {
  title: string;
  pitch: string | null;
  poles: PoleCode[];
  speakers: ParsedSpeaker[];
  /** P16.x : chiffres clés extraits de la section « CHIFFRES CLÉS » (max 5). */
  keyFigures: string[];
  /** P16.x : public cible extrait de la section « PUBLIC VISÉ » (texte complet). */
  targetAudience: string | null;
};

function deburr(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const POLE_KEYWORDS: { pole: PoleCode; words: string[] }[] = [
  {
    pole: 'REGIES_RETAIL_MEDIA',
    words: ['regie', 'régie', 'retail media', 'annonceur', 'monetis', 'self-service'],
  },
  {
    pole: 'AUDIO_RADIO',
    words: ['audio', 'radio', 'podcast', 'dab', 'fm', 'voix', 'jingle', 'antenne', 'auditeur'],
  },
  {
    pole: 'DIFFUSION_INFRA',
    words: [
      'diffusion',
      'broadcast',
      'cloud',
      '5g',
      'infrastructure',
      'souverain',
      'transmission',
      'emetteur',
      'multiplex',
    ],
  },
  { pole: 'VIDEO_CTV', words: ['ctv', 'fast', 'video', 'vidéo', ' tv', 'streaming', 'replay'] },
  { pole: 'OUTDOOR_DOOH', words: ['dooh', 'outdoor', 'affichage', 'ooh', 'ecran'] },
  {
    pole: 'DATA_ADTECH',
    words: [
      'data',
      'adtech',
      'cookie',
      'identite',
      'mesure',
      'programmatique',
      'intelligence artificielle',
      'retail media',
      'attribution',
      'addressable',
      'geo',
      'ssp',
      'dsp',
      'dmp',
    ],
  },
];

/** Détecte les pôles MDS depuis un texte (titre + pitch). Ordre POLE_CODES. */
export function detectPoles(text: string): PoleCode[] {
  const t = deburr(text);
  const hits: PoleCode[] = [];
  for (const { pole, words } of POLE_KEYWORDS) {
    if (words.some((w) => t.includes(w)) && !hits.includes(pole)) hits.push(pole);
  }
  return hits;
}

const SKIP_PREFIXES =
  /^(aller plus loin|aller \+ loin|à noter|★|mode d|chaque fiche|sociétés citées|doctrine|document|éditions|volet|intégré|10 thématiques|pré-programme|intervenants pressentis &|société$|activité$|dans la base|# *$|enjeu|force base|international$|thématique)/i;

const GENERIC_PREFIX = /^(un|une|un·e|un·|un\.e)\b/i;

const ORG_MARKERS =
  /\b(group|groupe|global|digital|media|médias|regie|régie|radio|gmbh|sas?|inc|ltd|unlimited|systems?|studio|productions?|music|records|by|tv|discovery|publicit|alliance|syndicat|union|metrics?|insights?|advertising|solutions?)\b/i;

function looksLikePerson(name: string): boolean {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length < 2 || tokens.length > 3) return false;
  if (/\d/.test(name)) return false;
  if (ORG_MARKERS.test(name)) return false;
  // chaque token commence par une majuscule (accents inclus).
  return tokens.every((tk) => /^[A-ZÀ-ÖØ-Þ]/.test(tk));
}

function orgFromParen(paren: string): string {
  // Retire "— à confirmer" / suffixes em-dash.
  const base = paren.split(/—|–/)[0].trim();
  const segs = base
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.length > 1) {
    // Si le 1er segment est un rôle (commence en minuscule), l'org est le dernier.
    return /^[a-zà-ÿ]/.test(segs[0]) ? segs[segs.length - 1] : segs[0];
  }
  return segs[0] ?? base;
}

/** Parse une ligne d'intervenant. Renvoie null si ce n'est pas un speaker. */
export function parseSpeakerLine(line: string): ParsedSpeaker | null {
  const raw = line.trim();
  if (!raw || SKIP_PREFIXES.test(raw)) return null;

  const dashIdx = raw.search(/\s[—–]\s/);
  const who = (dashIdx >= 0 ? raw.slice(0, dashIdx) : raw).trim();
  const role =
    dashIdx >= 0
      ? raw
          .slice(dashIdx)
          .replace(/^\s*[—–]\s*/, '')
          .trim() || null
      : null;
  if (!who) return null;

  // Générique ("Un groupe radio…", "Un·e juriste média") → placeholder org.
  if (GENERIC_PREFIX.test(who)) {
    const org =
      who
        .replace(GENERIC_PREFIX, '')
        .replace(/^[\s·.e]+/i, '')
        .trim() || who;
    return { kind: 'org', displayName: who, firstName: null, lastName: null, org, role };
  }

  const paren = who.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (paren) {
    const left = paren[1].trim();
    if (looksLikePerson(left)) {
      const tokens = left.split(/\s+/);
      return {
        kind: 'person',
        displayName: left,
        firstName: tokens[0],
        lastName: tokens.slice(1).join(' '),
        org: orgFromParen(paren[2]),
        role,
      };
    }
    // Org avec parenthèse d'info (ex "Triton Digital (groupe iHeartMedia)").
    return { kind: 'org', displayName: left, firstName: null, lastName: null, org: left, role };
  }

  // Pas de parenthèse : organisation seule (ex "WorldDAB", "ElevenLabs").
  return { kind: 'org', displayName: who, firstName: null, lastName: null, org: who, role };
}

const HEADER_RE = /^T(\d+)\.\s+(.{4,})$/;
const SPEAKERS_LABEL_RE = /^(intervenants pressentis|speakers pressentis)$/i;
const SPEAKERS_STOP_RE = /^(soci[ée]t|exposants|récapitulatif|public vis|chiffres cl)/i;
const PITCH_INLINE_RE = /^pitch\s*[—–-]\s*(.+)$/i;
const KEY_FIGURES_LABEL_RE = /^chiffres cl[ée]s\s*$/i;
// Fin de la section chiffres clés : tout autre entête de section.
const KEY_FIGURES_STOP_RE =
  /^(intervenants|speakers|exposants|soci[ée]t|public vis|pitch|pourquoi|r[ée]capitulatif|format)/i;

const MAX_KEY_FIGURES = 5;
const MAX_KEY_FIGURE_LEN = 200;

const TARGET_LABEL_RE = /^public (vis[ée]?|cibl)/i;
const TARGET_STOP_RE =
  /^(pitch|chiffres cl[ée]s|intervenants|speakers|exposants|soci[ée]t|pourquoi|format)/i;
const MAX_TARGET_LEN = 2000;

/**
 * P16.x — extrait le public cible (section « PUBLIC VISÉ ») : tout le texte
 * entre l'entête et la section suivante, joint en un paragraphe. null si absent.
 */
export function extractTargetAudience(block: string[]): string | null {
  const start = block.findIndex((l) => TARGET_LABEL_RE.test(l));
  if (start < 0) return null;
  const parts: string[] = [];
  for (let i = start + 1; i < block.length; i += 1) {
    const line = block[i].trim();
    if (!line) continue;
    if (TARGET_STOP_RE.test(line)) break;
    parts.push(line);
  }
  const text = parts.join(' ').trim().slice(0, MAX_TARGET_LEN);
  return text.length > 0 ? text : null;
}

/**
 * P16.x — extrait les chiffres clés d'un bloc conférence : lignes entre
 * l'entête « CHIFFRES CLÉS » / « Chiffres clés » et l'entête de section
 * suivante. Max 5, tronqués à 200 caractères, dédoublonnés.
 */
export function extractKeyFigures(block: string[]): string[] {
  const start = block.findIndex((l) => KEY_FIGURES_LABEL_RE.test(l));
  if (start < 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = start + 1; i < block.length && out.length < MAX_KEY_FIGURES; i += 1) {
    const line = block[i].trim();
    if (!line) continue;
    if (KEY_FIGURES_STOP_RE.test(line)) break;
    const clean = line.slice(0, MAX_KEY_FIGURE_LEN);
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/** Parse le texte brut d'un DOCX en conférences. */
export function parseProgram(rawText: string): ParsedConference[] {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Index des entêtes de conférence (détail, pas le récap).
  const headers: { idx: number; title: string }[] = [];
  lines.forEach((l, i) => {
    const m = l.match(HEADER_RE);
    if (m) headers.push({ idx: i, title: m[2].trim() });
  });

  const conferences: ParsedConference[] = [];
  for (let h = 0; h < headers.length; h += 1) {
    const start = headers[h].idx;
    const end = h + 1 < headers.length ? headers[h + 1].idx : lines.length;
    const block = lines.slice(start + 1, end);

    // Pitch
    let pitch: string | null = null;
    for (let i = 0; i < block.length; i += 1) {
      const inline = block[i].match(PITCH_INLINE_RE);
      if (inline) {
        pitch = inline[1].trim();
        break;
      }
      if (block[i].toUpperCase() === 'PITCH' && block[i + 1]) {
        pitch = block[i + 1].trim();
        break;
      }
    }

    // Speakers
    const speakers: ParsedSpeaker[] = [];
    const sIdx = block.findIndex((l) => SPEAKERS_LABEL_RE.test(l));
    if (sIdx >= 0) {
      for (let i = sIdx + 1; i < block.length; i += 1) {
        if (SPEAKERS_STOP_RE.test(block[i])) break;
        const sp = parseSpeakerLine(block[i]);
        if (sp) speakers.push(sp);
      }
    }

    conferences.push({
      title: headers[h].title,
      pitch,
      poles: detectPoles(`${headers[h].title} ${pitch ?? ''}`),
      speakers,
      keyFigures: extractKeyFigures(block),
      targetAudience: extractTargetAudience(block),
    });
  }

  return conferences;
}
