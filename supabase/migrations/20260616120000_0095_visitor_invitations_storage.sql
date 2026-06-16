-- 0095: P15.4.InvitationLetterHybrid
--
-- 1) Bucket Storage privé `visitor-invitations` (PDF lettres d'invitation visa).
-- 2) Colonnes manquantes sur visitor_invitation_data pour générer la lettre
--    officielle (identité + société destinataire). 0094 ne couvrait que le
--    passeport/voyage ; la lettre exige nationalité, profession, date d'émission
--    passeport, et le bloc société complet (saisi par le visiteur).
--
-- ⚠️ NE PAS appliquer via MCP. Phil fait `pnpm db:push` après le commit.

-- =====================================================================
-- 1) Bucket Storage privé
-- =====================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('visitor-invitations', 'visitor-invitations', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Accès : bucket privé. Lecture/écriture via service_role uniquement
-- (download visiteur = signed URL générée côté server action). Le rôle
-- service_role bypass déjà les policies storage.objects ; pas de policy
-- supplémentaire nécessaire pour V1.

-- =====================================================================
-- 2) Colonnes lettre d'invitation (identité + société destinataire)
-- =====================================================================
ALTER TABLE public.visitor_invitation_data
  ADD COLUMN IF NOT EXISTS passport_issue_date   DATE,
  ADD COLUMN IF NOT EXISTS nationality           TEXT,
  ADD COLUMN IF NOT EXISTS profession            TEXT,
  ADD COLUMN IF NOT EXISTS company_name          TEXT,
  ADD COLUMN IF NOT EXISTS company_full_address  TEXT,
  ADD COLUMN IF NOT EXISTS postal_code           TEXT,
  ADD COLUMN IF NOT EXISTS city                  TEXT,
  ADD COLUMN IF NOT EXISTS country               TEXT;

COMMENT ON COLUMN public.visitor_invitation_data.nationality IS
  'P15.4 — nationalité du visiteur (lettre invitation visa).';
COMMENT ON COLUMN public.visitor_invitation_data.company_full_address IS
  'P15.4 — adresse société destinataire saisie par le visiteur (lettre).';
