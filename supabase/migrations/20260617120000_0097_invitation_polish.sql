-- 0097: P15.4-bis.InvitationPolish
--
-- Colonnes additionnelles sur visitor_invitation_data :
--   - locale            : langue choisie pour la lettre (fr|en), indépendante
--                         de visitors.language (dropdown form + admin).
--   - edited_at / edited_by : trace de la dernière édition admin des données.
--   - regenerated_count : nombre de régénérations PDF manuelles (admin).
--
-- ⚠️ NE PAS appliquer via MCP. Phil fait `pnpm db:push` après le commit.

ALTER TABLE public.visitor_invitation_data
  ADD COLUMN IF NOT EXISTS locale            TEXT CHECK (locale IN ('fr','en') OR locale IS NULL),
  ADD COLUMN IF NOT EXISTS edited_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_by         UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS regenerated_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.visitor_invitation_data.locale IS
  'P15.4-bis — langue de la lettre (fr|en), choisie par le visiteur/admin.';
COMMENT ON COLUMN public.visitor_invitation_data.regenerated_count IS
  'P15.4-bis — compteur de régénérations manuelles du PDF par un admin.';
