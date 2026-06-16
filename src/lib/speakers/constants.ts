/**
 * P16.1 — constantes & labels speakers (safe client + serveur).
 */

export const SPEAKER_TYPES = ['keynote', 'panel', 'masterclass', 'workshop', 'moderator'] as const;
export type SpeakerType = (typeof SPEAKER_TYPES)[number];

export const SPEAKER_TYPE_LABEL: Record<SpeakerType, string> = {
  keynote: 'Keynote',
  panel: 'Panel',
  masterclass: 'Masterclass',
  workshop: 'Workshop',
  moderator: 'Modérateur',
};

export const SPEAKER_STATUSES = [
  'proposed',
  'contacted',
  'confirmed',
  'declined',
  'cancelled',
] as const;
export type SpeakerStatus = (typeof SPEAKER_STATUSES)[number];

export const SPEAKER_STATUS_LABEL: Record<SpeakerStatus, string> = {
  proposed: 'Proposé',
  contacted: 'Contacté',
  confirmed: 'Confirmé',
  declined: 'Décliné',
  cancelled: 'Annulé',
};

// Doctrine badges : confirmé=vert, proposé=jaune, contacté=bleu, décliné/annulé=rouge.
export const SPEAKER_STATUS_CLASS: Record<SpeakerStatus, string> = {
  proposed: 'bg-md-warning/15 text-md-warning',
  contacted: 'bg-md-blue/10 text-md-blue',
  confirmed: 'bg-md-success/15 text-md-success',
  declined: 'bg-md-danger/15 text-md-danger',
  cancelled: 'bg-md-danger/15 text-md-danger',
};

export type SpeakerListItem = {
  id: string;
  speaker_type: string | null;
  status: string;
  topics: string[] | null;
  language: string;
  photo_url: string | null;
  confirmed_at: string | null;
  created_at: string;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone_mobile: string | null;
  } | null;
  company: { id: string; name: string } | null;
  owner: { id: string; full_name: string | null } | null;
  conference_count: number;
};
