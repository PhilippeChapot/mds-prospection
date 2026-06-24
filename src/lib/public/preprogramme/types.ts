/**
 * P16.x.PreProgrammeTeaser — types partagés (action + composants).
 * Module pur (pas de 'use server'). AUCUNE donnée intervenant exposée : on
 * compte seulement les speakers, jamais leurs identités (RGPD + teasing).
 */

export type ProgramTrack = 'mds_solutions' | 'prs_radio_audio';

export interface PreProgrammePole {
  code: string;
  name: string;
  colorHex: string;
}

export interface PreProgrammeConference {
  id: string;
  slug: string | null;
  track: ProgramTrack;
  title: string;
  description: string | null;
  conferenceType: string | null;
  targetAudience: string | null;
  keyFigures: string[];
  poles: PreProgrammePole[];
}

export interface PreProgrammePoleStat extends PreProgrammePole {
  count: number;
}

export interface PreProgrammeData {
  kpis: {
    conferenceCount: number;
    speakerCount: number;
    poleCount: number;
  };
  repartition: PreProgrammePoleStat[];
  mds: PreProgrammeConference[];
  prs: PreProgrammeConference[];
}

export type PreProgrammeResult =
  | { ok: true; data: PreProgrammeData }
  | { ok: false; reason: 'forbidden' | 'empty' };
