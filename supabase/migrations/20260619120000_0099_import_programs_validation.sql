-- 0099: P16.x.ImportPrograms — import programmes DOCX + workflow de validation
--
-- Ajoute le suivi d'import + validation sur speakers ET conferences :
--   - program_track    : 'mds_solutions' | 'prs_radio_audio' (TEXT libre).
--   - is_validated     : DEFAULT true → les lignes existantes (saisies à la main)
--                        restent validées ; l'import met false (à valider par Phil).
--   - imported_at / imported_source : trace de provenance.
--   - validated_at / validated_by   : trace de validation.
--
-- ⚠️ NE PAS appliquer via MCP. Phil fait `pnpm db:push` puis lance le script.

ALTER TABLE public.conferences
  ADD COLUMN IF NOT EXISTS program_track   TEXT,
  ADD COLUMN IF NOT EXISTS is_validated    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS imported_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_source TEXT,
  ADD COLUMN IF NOT EXISTS validated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by    UUID REFERENCES public.users(id);

ALTER TABLE public.speakers
  ADD COLUMN IF NOT EXISTS program_track   TEXT,
  ADD COLUMN IF NOT EXISTS is_validated    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS imported_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_source TEXT,
  ADD COLUMN IF NOT EXISTS validated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by    UUID REFERENCES public.users(id);

-- Filtres "non validés" fréquents → index partiels.
CREATE INDEX IF NOT EXISTS idx_conferences_unvalidated
  ON public.conferences(is_validated) WHERE is_validated = false;
CREATE INDEX IF NOT EXISTS idx_speakers_unvalidated
  ON public.speakers(is_validated) WHERE is_validated = false;

COMMENT ON COLUMN public.conferences.program_track IS
  'P16.x — volet programme : mds_solutions | prs_radio_audio.';
COMMENT ON COLUMN public.conferences.is_validated IS
  'P16.x — false = importé non validé (à arbitrer par Phil). DEFAULT true.';
