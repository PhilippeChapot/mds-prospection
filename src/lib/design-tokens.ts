/**
 * MDS Prospection — Design Tokens (TypeScript mirror of @theme in globals.css).
 * Source de vérité : docs/DESIGN-TOKENS.md
 * Couleurs officielles extraites des SVG de public/brand/.
 */

export const brandColors = {
  blue: '#294294',
  blueBright: '#0B3FA8',
  blueDark: '#031A56',
  blueDeep: '#00124A',
  magenta: '#E6007E',
  magentaSoft: '#FF4DA0',
  bg: '#F2F4FB',
  text: '#0E1A3C',
  textMuted: '#5C6A8A',
  border: '#DCE2F0',
  success: '#1FBF7A',
  warning: '#F5A524',
  danger: '#E5484D',
} as const;

/**
 * Codes des 6 pôles thématiques + INCONNU.
 * Doit rester aligné avec l'ENUM `pole_code` côté Postgres et la table `poles`.
 * SPEC §3.1.
 */
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

export const poleColor: Record<PoleCode, string> = {
  REGIES_RETAIL_MEDIA: '#FFCDD2',
  AUDIO_RADIO: '#F8BBD0',
  DIFFUSION_INFRA: '#E1BEE7',
  VIDEO_CTV: '#BBDEFB',
  OUTDOOR_DOOH: '#FFE0B2',
  DATA_ADTECH: '#C8E6C9',
  INCONNU: '#E5E7EB',
};

export const poleEmoji: Record<PoleCode, string> = {
  REGIES_RETAIL_MEDIA: '🏛️',
  AUDIO_RADIO: '🎙️',
  DIFFUSION_INFRA: '📡',
  VIDEO_CTV: '🎥',
  OUTDOOR_DOOH: '📢',
  DATA_ADTECH: '📊',
  INCONNU: '❔',
};
