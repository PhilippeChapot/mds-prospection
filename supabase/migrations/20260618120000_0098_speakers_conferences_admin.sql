-- 0098: P16.1 + P16.3 — Admin Speakers + Conferences
--
-- Complète les SHELLs P15.1 (0094) pour le workflow admin complet :
--   - speakers    : médias/portrait/bio longue + date de confirmation.
--   - conferences : slug (URL publique P16.5) + featured (mise en avant).
--
-- audit_log.entity_type est un TEXT libre (déjà utilisé avec 'visitors') →
-- pas de changement d'enum nécessaire pour 'speakers' / 'conferences'.
--
-- ⚠️ NE PAS appliquer via MCP. Phil fait `pnpm db:push`.

ALTER TABLE public.speakers
  ADD COLUMN IF NOT EXISTS photo_url       TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url    TEXT,
  ADD COLUMN IF NOT EXISTS twitter_handle  TEXT,
  ADD COLUMN IF NOT EXISTS bio_long        TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at    TIMESTAMPTZ;

ALTER TABLE public.conferences
  ADD COLUMN IF NOT EXISTS slug            TEXT,
  ADD COLUMN IF NOT EXISTS featured        BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_conferences_slug
  ON public.conferences(slug) WHERE slug IS NOT NULL;

-- Check anti-overlap par salle (room + créneau).
CREATE INDEX IF NOT EXISTS idx_conferences_room_slot
  ON public.conferences(room, start_at, end_at)
  WHERE room IS NOT NULL AND start_at IS NOT NULL;

COMMENT ON COLUMN public.conferences.slug IS
  'P16.3 — slug URL publique (programme P16.5). Unique si non NULL.';
COMMENT ON COLUMN public.speakers.confirmed_at IS
  'P16.1 — date de passage au statut confirmed.';
