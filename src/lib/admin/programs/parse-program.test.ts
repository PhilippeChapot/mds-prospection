/**
 * @vitest-environment node
 *
 * P16.x.ImportPrograms — tests parser pur (detectPoles, parseSpeakerLine, parseProgram).
 */
import { describe, it, expect } from 'vitest';
import { detectPoles, parseSpeakerLine, parseProgram } from './parse-program';

const MDS_TEXT = `
T1. Titre MDS audio digital
Pourquoi ce thème — contexte
PUBLIC VISÉ
les gens
PITCH
Un pitch sur l'audio et le podcast.
CHIFFRES CLÉS
x
INTERVENANTS PRESSENTIS
Nicolas Jaimes (Open Garden) — le futur de la pub
M6 Unlimited (My6 / SmartSelect) — self-service
SOCIÉTÉS CIBLÉES (EXPOSANTS POTENTIELS)
Société
T2. Autre conf DOOH outdoor
PITCH
Un pitch outdoor dooh affichage programmatique.
INTERVENANTS PRESSENTIS
WorldDAB — la coordination
SOCIÉTÉS CIBLÉES (EXPOSANTS POTENTIELS)
Société
`.trim();

const PRS_TEXT = `
T1. Conf PRS radio FM
Pitch — Un pitch radio FM DAB et podcast.
Chiffres clés
x
Speakers pressentis
Markus Adomeit (fondateur, Aireal Group) — automatiser
Un groupe radio (FR) — retour d'expérience
Aller plus loin (international) — à ignorer
`.trim();

describe('detectPoles (P16.x)', () => {
  it('audio/radio/podcast → AUDIO_RADIO', () => {
    expect(detectPoles('La radio et le podcast audio')).toContain('AUDIO_RADIO');
  });
  it('DOOH outdoor affichage → OUTDOOR_DOOH', () => {
    expect(detectPoles('La stack DOOH et outdoor affichage')).toContain('OUTDOOR_DOOH');
  });
  it('data programmatique → DATA_ADTECH', () => {
    expect(detectPoles('mesure data et programmatique')).toContain('DATA_ADTECH');
  });
});

describe('parseSpeakerLine (P16.x)', () => {
  it('personne nommée (Org) → person + org', () => {
    const s = parseSpeakerLine('Nicolas Jaimes (Open Garden) — le futur de la pub');
    expect(s).toMatchObject({
      kind: 'person',
      firstName: 'Nicolas',
      lastName: 'Jaimes',
      org: 'Open Garden',
    });
  });
  it('org seule → org', () => {
    const s = parseSpeakerLine('WorldDAB — coordination mondiale');
    expect(s).toMatchObject({ kind: 'org', org: 'WorldDAB' });
    expect(s?.firstName).toBeNull();
  });
  it('rôle, Org dans parenthèses → org = dernier segment', () => {
    const s = parseSpeakerLine('Markus Adomeit (fondateur, Aireal Group) — automatiser');
    expect(s).toMatchObject({ kind: 'person', firstName: 'Markus', org: 'Aireal Group' });
  });
  it('générique "Un groupe radio" → org placeholder', () => {
    const s = parseSpeakerLine('Un groupe radio (FR) — retour');
    expect(s?.kind).toBe('org');
  });
  it('"Aller plus loin" → null (ignoré)', () => {
    expect(parseSpeakerLine('Aller plus loin (international) — x')).toBeNull();
  });
});

describe('parseProgram (P16.x)', () => {
  it('MDS → 2 conférences, pitch + speakers extraits', () => {
    const confs = parseProgram(MDS_TEXT);
    expect(confs).toHaveLength(2);
    expect(confs[0].title).toBe('Titre MDS audio digital');
    expect(confs[0].pitch).toContain('audio et le podcast');
    expect(confs[0].poles).toContain('AUDIO_RADIO');
    expect(confs[0].speakers).toHaveLength(2);
    expect(confs[0].speakers[0]).toMatchObject({ kind: 'person', firstName: 'Nicolas' });
    expect(confs[0].speakers[1].kind).toBe('org');
    expect(confs[1].speakers).toHaveLength(1);
  });

  it('PRS → pitch inline + speakers (Aller plus loin ignoré)', () => {
    const confs = parseProgram(PRS_TEXT);
    expect(confs).toHaveLength(1);
    expect(confs[0].pitch).toContain('radio FM DAB');
    expect(confs[0].speakers).toHaveLength(2); // "Aller plus loin" exclu
    expect(confs[0].speakers[0]).toMatchObject({ kind: 'person', org: 'Aireal Group' });
  });
});
