-- Migration 0068 — P8.3-quater : tracking traduction IA des campagnes.
--
-- Trois colonnes pour suivre l etat de traduction Claude Haiku 4.5 :
--   - fr_translated_by_ai_at : timestamp si la version FR a ete generee
--     par l IA (cas : campagne redigee en EN d abord, traduite en FR).
--   - en_translated_by_ai_at : timestamp si la version EN a ete generee
--     par l IA (cas standard : redaction FR puis traduction EN).
--   - translation_model : identifiant du modele utilise (ex :
--     'claude-haiku-4-5-20251001'). Trace pour audit qualité.
--
-- Logique applicative :
--   - translateCampaignAction met le timestamp + le modele.
--   - markCampaignBodyManuallyEditedAction reset le timestamp a NULL
--     (l'admin a relu et corrige -> plus de warning).
--   - UI affiche un badge jaune "Traduit par IA - a relire" tant que
--     le timestamp est non null.

alter table public.email_campaigns
  add column if not exists fr_translated_by_ai_at timestamptz,
  add column if not exists en_translated_by_ai_at timestamptz,
  add column if not exists translation_model text;

comment on column public.email_campaigns.fr_translated_by_ai_at is
  'P8.3-quater - timestamp generation FR par IA (NULL si redige manuellement).';
comment on column public.email_campaigns.en_translated_by_ai_at is
  'P8.3-quater - timestamp generation EN par IA (NULL si redige manuellement).';
comment on column public.email_campaigns.translation_model is
  'P8.3-quater - identifiant modele Anthropic ayant traduit (claude-haiku-4-5-20251001).';

-- Le service-role bypass RLS pour les server actions. RLS legacy P5
-- gere deja les acces admin/sales. Pas de grants additionnels requis.
