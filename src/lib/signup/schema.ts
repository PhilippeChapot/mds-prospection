/**
 * Zod schemas partages entre client (react-hook-form) et server
 * (POST /api/signup/init).
 *
 * Fichier neutre : aucun import de next/headers, supabase server, etc.
 * pour rester safe-to-import depuis un client component (vigilance bug
 * P2 M5 sur ProspectsListClient).
 */

import { z } from 'zod';

export const SUPPORTED_COUNTRIES = [
  'FR',
  'BE',
  'CH',
  'LU',
  'MC',
  'GB',
  'DE',
  'ES',
  'IT',
  'NL',
  'PT',
  'US',
  'CA',
  'OTHER',
] as const;

export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];

/**
 * Pays UE non-FR exposes dans le selecteur "Pays TVA" du wizard.
 * Doit rester aligne avec EU_COUNTRIES_NON_FR du helper VIES.
 * (Liste plus restreinte que SUPPORTED_COUNTRIES qui contient aussi
 * CH, GB, US, CA, etc. non eligibles a l'autoliquidation Art. 196.)
 */
export const EU_VAT_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
] as const;

export type EuVatCountry = (typeof EU_VAT_COUNTRIES)[number];

/**
 * P11.x.Sponsor-Rename (2026-06-05) : intention d inscription declaree
 * a l etape 1.
 *   - 'partenaire' = ex-Exposant = inscription pour avoir un stand physique
 *   - 'sponsor'    = ex-Partenaire historique = soutien marque sans stand
 *
 * Distinct de companies.category (`category_tarif`) qui gere l eligibilite
 * tarifaire (`prs_exhibitor` | `standard` | `non_eligible`).
 */
export const SIGNUP_CATEGORIES = ['partenaire', 'sponsor'] as const;
export type SignupCategory = (typeof SIGNUP_CATEGORIES)[number];

export const SIGNUP_LOCALES = ['fr', 'en'] as const;
export type SignupLocale = (typeof SIGNUP_LOCALES)[number];

/**
 * Etape 1 — schema cote client + server.
 * - companyId optionnel : si non fourni, on cree la company depuis companyName.
 * - hcaptchaToken vide en dev (verifyHCaptchaToken bypass).
 * - honeypot doit rester vide. Si rempli -> bot, on rejette silencieusement.
 */
export const signupStep1Schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  companyId: z.string().uuid().optional().nullable(),
  companyName: z.string().trim().min(2).max(200),
  companyCountry: z.enum(SUPPORTED_COUNTRIES),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(40).nullable(),
  // Affiliation P3.x : capture texte libre. Sera normalisee + matchee
  // contre la table affiliates en P5 (calcul commission retroactif possible).
  affiliateInput: z.string().trim().max(200).nullable(),
  // P5.x.1 — TVA UE intracommunautaire (autoliquidation Art. 196).
  //   - vatCountry : code pays UE (ex: 'DE', 'BE'). null si client FR ou
  //     hors UE — dans ce cas vatNumber et vatVerified sont ignores.
  //   - vatNumber  : numero saisi (sans prefixe pays). null si pas applicable.
  //   - vatVerified : true si l'utilisateur a presse "Verifier" et VIES
  //     a renvoye OK. Le serveur re-verifie ensuite via le cache 30j.
  // Cote client, le <select> renvoie "" pour le placeholder ; le form
  // doit utiliser `setValueAs` (ou un onChange custom) pour normaliser
  // en null avant d'appeler le resolver.
  vatCountry: z.enum(EU_VAT_COUNTRIES).nullable(),
  vatNumber: z.string().trim().max(40).nullable(),
  vatVerified: z.boolean(),
  category: z.enum(SIGNUP_CATEGORIES),
  consentRgpd: z.boolean().refine((v) => v === true, { message: 'consentRgpdRequired' }),
  consentMarketing: z.boolean(),
  hcaptchaToken: z.string().nullable(),
  honeypot: z.string().max(0, { message: 'honeypot' }).nullable(),
  locale: z.enum(SIGNUP_LOCALES),
  // Champs de tracking optionnels (remplis cote client depuis URL).
  utmSource: z.string().max(120).nullable(),
  utmMedium: z.string().max(120).nullable(),
  utmCampaign: z.string().max(120).nullable(),
  referrer: z.string().max(500).nullable(),
});

export type SignupStep1Input = z.infer<typeof signupStep1Schema>;

/**
 * Reponse API /api/signup/init.
 */
export type SignupInitResponse =
  | { success: true; signupId: string }
  | { success: false; error: SignupInitErrorCode; field?: keyof SignupStep1Input };

export type SignupInitErrorCode =
  | 'invalid_payload'
  | 'captcha_failed'
  | 'email_undeliverable'
  | 'email_free_provider'
  | 'email_disposable'
  | 'email_duplicate_recent'
  | 'email_duplicate_prospect'
  | 'rate_limited'
  | 'internal_error';
