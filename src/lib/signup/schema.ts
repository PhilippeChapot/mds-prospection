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

export const SIGNUP_CATEGORIES = ['exposant', 'partenaire'] as const;
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
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  category: z.enum(SIGNUP_CATEGORIES),
  consentRgpd: z.literal(true, {
    message: 'consentRgpdRequired',
  }),
  consentMarketing: z.boolean().default(false),
  hcaptchaToken: z.string().optional().nullable(),
  honeypot: z.string().max(0).optional().nullable(),
  locale: z.enum(SIGNUP_LOCALES),
  // Champs de tracking optionnels (remplis cote client depuis URL).
  utmSource: z.string().max(120).optional().nullable(),
  utmMedium: z.string().max(120).optional().nullable(),
  utmCampaign: z.string().max(120).optional().nullable(),
  referrer: z.string().max(500).optional().nullable(),
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
  | 'email_duplicate_recent'
  | 'email_duplicate_prospect'
  | 'rate_limited'
  | 'internal_error';
