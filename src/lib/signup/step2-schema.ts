/**
 * Schemas Zod pour les payloads etape 2 (Cas A et Cas B).
 * Fichier neutre : pas de next/headers ni supabase/server.
 */

import { z } from 'zod';

// ----- payment_path enum (matche public.payment_path en DB) -----
export const PAYMENT_PATHS = [
  'devis_sepa',
  'devis_acompte_stripe',
  'proforma_acompte',
  'facture_integrale',
] as const;
export type PaymentPath = (typeof PAYMENT_PATHS)[number];

// ----- booth_event enum -----
export const BOOTH_EVENTS = ['paris', 'marseille'] as const;
export type BoothEvent = (typeof BOOTH_EVENTS)[number];

// ----- Cas A : payload final -----
//
// Realite business P3 :
//   - Paris est TOUJOURS selectionne (parisSelected=true force par l'UI).
//   - Marseille est OPTIONNEL (supplement HT depend du pack).
//   - L'emplacement physique se choisit en 3 preferences textuelles
//     (boothPreferences = ["B3", "C5", "D2"]) — booth_inventory reste
//     vide en P3, l'admin assignera manuellement en P4.
export const step2CaseASchema = z.object({
  mode: z.literal('caseA'),
  packCode: z.enum(['ACCESS', 'CLASSIC', 'PREMIUM']),
  pricingTierId: z.string().uuid(),
  parisSelected: z.literal(true),
  marseilleSelected: z.boolean(),
  boothPreferences: z.tuple([
    z.string().trim().min(1).max(20),
    z.string().trim().min(1).max(20),
    z.string().trim().min(1).max(20),
  ]),
  addonIds: z.array(z.string().uuid()),
  paymentPath: z.enum(PAYMENT_PATHS),
  cgvAccepted: z.literal(true),
});
export type Step2CaseAPayload = z.infer<typeof step2CaseASchema>;

// ----- Cas A : payload partiel (save autorise champs optionnels)
// On garde literal(true) sur parisSelected mais facultatif dans le partial,
// et boothPreferences en array de 0..3 strings au lieu du tuple strict.
export const step2CaseAPartialSchema = z.object({
  mode: z.literal('caseA'),
  packCode: z.enum(['ACCESS', 'CLASSIC', 'PREMIUM']).optional(),
  pricingTierId: z.string().uuid().optional(),
  parisSelected: z.boolean().optional(),
  marseilleSelected: z.boolean().optional(),
  boothPreferences: z.array(z.string().trim().max(20)).max(3).optional(),
  addonIds: z.array(z.string().uuid()).optional(),
  paymentPath: z.enum(PAYMENT_PATHS).optional(),
  cgvAccepted: z.boolean().optional(),
});
export type Step2CaseAPartialPayload = z.infer<typeof step2CaseAPartialSchema>;

// ----- Cas B : payload -----
// Note metier (mai 2026) : la taille du grand stand est passee de 12m² a 9m²,
// et "Sponsor pole" (sponsoring d'un pole thematique) est devenu "Sponsoriser
// le salon" (sponsoring de l'evenement entier). Les anciennes valeurs
// `stand_12` / `sponsor_pole` peuvent rester en DB sur des signups existants
// — le rendu admin (Step2PayloadView) les supporte pour retrocompat, mais le
// wizard ne les propose plus.
export const STEP2_CASE_B_INTERESTS = [
  'stand_6',
  'stand_9',
  'sponsor_show',
  'visitor',
  'partner_media',
] as const;
export type Step2CaseBInterest = (typeof STEP2_CASE_B_INTERESTS)[number];

export const STEP2_CASE_B_BUDGETS = ['500_5k', '5k_15k', '15k_plus', 'tbd'] as const;
export type Step2CaseBBudget = (typeof STEP2_CASE_B_BUDGETS)[number];

export const STEP2_CASE_B_POLES = [
  'REGIES_RETAIL_MEDIA',
  'AUDIO_RADIO',
  'DIFFUSION_INFRA',
  'VIDEO_CTV',
  'OUTDOOR_DOOH',
  'DATA_ADTECH',
  'MULTIPLE',
] as const;
export type Step2CaseBPole = (typeof STEP2_CASE_B_POLES)[number];

export const step2CaseBSchema = z.object({
  mode: z.literal('caseB'),
  interests: z.array(z.enum(STEP2_CASE_B_INTERESTS)).min(1),
  pole: z.enum(STEP2_CASE_B_POLES),
  budget: z.enum(STEP2_CASE_B_BUDGETS),
  message: z.string().trim().max(2000),
});
export type Step2CaseBPayload = z.infer<typeof step2CaseBSchema>;

export const step2CaseBPartialSchema = step2CaseBSchema.partial().extend({
  mode: z.literal('caseB'),
});

// ----- Union finale pour /step2/submit -----
export const step2SubmitSchema = z.discriminatedUnion('mode', [step2CaseASchema, step2CaseBSchema]);
export type Step2SubmitPayload = z.infer<typeof step2SubmitSchema>;

export const step2SavePartialSchema = z.discriminatedUnion('mode', [
  step2CaseAPartialSchema,
  step2CaseBPartialSchema,
]);
export type Step2SavePartialPayload = z.infer<typeof step2SavePartialSchema>;
