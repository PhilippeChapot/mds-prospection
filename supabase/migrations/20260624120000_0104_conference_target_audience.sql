-- P16.x.PreProgrammeTeaser : public cible par conférence (affiché dans le
-- pré-programme privé, sans révéler intervenants ni horaires).

ALTER TABLE public.conferences
  ADD COLUMN IF NOT EXISTS target_audience_fr TEXT NULL,
  ADD COLUMN IF NOT EXISTS target_audience_en TEXT NULL;

COMMENT ON COLUMN public.conferences.target_audience_fr IS
  'Public cible (FR), ex: "Directeurs marketing, responsables média". Affiché dans le pré-programme privé. P16.x.PreProgrammeTeaser';
COMMENT ON COLUMN public.conferences.target_audience_en IS
  'Public cible (EN). Affiché dans le pré-programme privé. P16.x.PreProgrammeTeaser';
