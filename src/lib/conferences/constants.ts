/**
 * P16.3 — constantes & labels conférences (safe client + serveur).
 */

export const CONFERENCE_TYPES = [
  'keynote',
  'panel',
  'masterclass',
  'workshop',
  'networking',
] as const;
export type ConferenceType = (typeof CONFERENCE_TYPES)[number];

export const CONFERENCE_TYPE_LABEL: Record<ConferenceType, string> = {
  keynote: 'Keynote',
  panel: 'Panel',
  masterclass: 'Masterclass',
  workshop: 'Workshop',
  networking: 'Networking',
};

export const CONFERENCE_CITIES = ['Marseille', 'Bruxelles', 'Paris'] as const;
export type ConferenceCity = (typeof CONFERENCE_CITIES)[number];

export const CONFERENCE_SPEAKER_ROLES = [
  'keynote_speaker',
  'panelist',
  'moderator',
  'expert',
  'host',
] as const;
export type ConferenceSpeakerRole = (typeof CONFERENCE_SPEAKER_ROLES)[number];

export const CONFERENCE_SPEAKER_ROLE_LABEL: Record<ConferenceSpeakerRole, string> = {
  keynote_speaker: 'Keynote speaker',
  panelist: 'Panéliste',
  moderator: 'Modérateur',
  expert: 'Expert',
  host: 'Hôte',
};

export type ConferenceListItem = {
  id: string;
  title_fr: string;
  title_en: string | null;
  conference_type: string | null;
  start_at: string | null;
  end_at: string | null;
  room: string | null;
  city: string | null;
  capacity: number | null;
  poles: string[] | null;
  is_published: boolean;
  featured: boolean;
  is_validated: boolean;
  imported_at: string | null;
  speaker_count: number;
};
