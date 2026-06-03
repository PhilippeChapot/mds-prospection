/**
 * P11.x.Rebrand — types publics du module partner-resources.
 *
 * Extraits depuis actions.ts (qui est 'use server' et ne peut exporter
 * que des fonctions async). Cf doctrine
 * feedback_pnpm_build_before_push_server_files.
 */

export type PartnerResourceRow = {
  id: string;
  slug: string;
  title_fr: string;
  title_en: string;
  body_fr: string | null;
  body_en: string | null;
  is_published: boolean;
  display_order: number;
  updated_at: string;
  updated_by_user_id: string | null;
  created_at: string;
};

export type PublishedResource = {
  id: string;
  slug: string;
  title: string;
  body: string;
  display_order: number;
  updated_at: string;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
