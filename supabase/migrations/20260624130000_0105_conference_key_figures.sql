-- P16.x.ConferencesKeyFigures : chiffres clés par conférence (extraits des
-- DOCX section « CHIFFRES CLÉS »), bilingues. Affichés dans le pré-programme.

ALTER TABLE public.conferences
  ADD COLUMN IF NOT EXISTS key_figures_fr TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS key_figures_en TEXT[] NULL;

COMMENT ON COLUMN public.conferences.key_figures_fr IS
  'Chiffres clés (FR), max 5, extraits de la section CHIFFRES CLÉS du DOCX. P16.x';
COMMENT ON COLUMN public.conferences.key_figures_en IS
  'Chiffres clés (EN) — traduits via Haiku 4.5. P16.x';
