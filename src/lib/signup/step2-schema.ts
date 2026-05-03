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
export const step2CaseASchema = z.object({
  mode: z.literal('caseA'),
  packCode: z.enum(['ACCESS', 'CLASSIC', 'PREMIUM']),
  pricingTierId: z.string().uuid(),
  salons: z.array(z.enum(BOOTH_EVENTS)).min(1),
  boothId: z.string().uuid(),
  addonIds: z.array(z.string().uuid()),
  paymentPath: z.enum(PAYMENT_PATHS),
  cgvAccepted: z.literal(true),
});
export type Step2CaseAPayload = z.infer<typeof step2CaseASchema>;

// ----- Cas A : payload partiel (save autorise tous les champs optionnels) -----
export const step2CaseAPartialSchema = step2CaseASchema.partial().extend({
  mode: z.literal('caseA'),
});
export type Step2CaseAPartialPayload = z.infer<typeof step2CaseAPartialSchema>;

// ----- Cas B : payload -----
export const STEP2_CASE_B_INTERESTS = [
  'stand_6',
  'stand_12',
  'sponsor_pole',
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
