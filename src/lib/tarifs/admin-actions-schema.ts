/**
 * P6.x.1a-bis — Zod schemas + types pour les server actions du module Tarifs.
 *
 * Séparé de admin-actions.ts car Next.js 15 strict mode interdit qu'un fichier
 * `'use server'` exporte autre chose que des fonctions async. Tout ce qui
 * n'est pas une action (types, zod schemas) vit ici.
 */

import { z } from 'zod';
import { TARIF_CATEGORIES } from './types';

export type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

export const upsertEditorialSchema = z.object({
  sellsy_product_id: z.number().int().positive(),
  category: z.enum(TARIF_CATEGORIES as [string, ...string[]]),
  sub_category: z.string().trim().max(80).optional().nullable(),
  display_order: z.number().int().min(0).max(99999).default(9999),
  featured: z.boolean().default(false),
  editorial_title: z.string().trim().max(200).optional().nullable(),
  tagline: z.string().trim().max(300).optional().nullable(),
  description_md: z.string().max(20000).optional().nullable(),
  image_url: z.string().url().optional().nullable().or(z.literal('')),
  tags: z.array(z.string().trim().max(40)).default([]),
  target_audience: z.string().trim().max(200).optional().nullable(),
  value_proposition: z.string().trim().max(500).optional().nullable(),
  is_visible_public: z.boolean().default(true),
});

export type UpsertEditorialInput = z.input<typeof upsertEditorialSchema>;

export const deleteEditorialSchema = z.object({
  sellsy_product_id: z.number().int().positive(),
});
