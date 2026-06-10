-- Migration 0092 — P11.x.PartnerPasswordOptional
--
-- Ajoute l'option mot de passe sur les comptes partenaires.
-- Les comptes partenaires sont identifiés via la table `contacts`
-- (le JWT de session contient contact_id comme subject).
--
-- Deux volets :
--   1. Colonnes password_hash + password_set_at sur contacts.
--      Nullable : NULL = "magic link only" (comportement par défaut).
--      Hash bcrypt cost 12 — jamais le plain text.
--
--   2. Table partner_password_reset_tokens : tokens à usage unique,
--      TTL 30 min, index sparse sur (expires_at) WHERE used_at IS NULL
--      pour le sweep de nettoyage des tokens expirés.
--
-- ⚠️ NE PAS appliquer via MCP — Phil fait `pnpm db:push`.

-- ─── Colonnes mot de passe sur contacts ────────────────────────────

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contacts.password_hash IS
  'P11.x — hash bcrypt (cost 12) du mot de passe partenaire. NULL = magic link only.';
COMMENT ON COLUMN public.contacts.password_set_at IS
  'P11.x — date du dernier set/changement du mot de passe. NULL si jamais configuré.';

-- ─── Table tokens reset mot de passe ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_password_reset_tokens (
  token        TEXT PRIMARY KEY,
  contact_id   UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address   TEXT,
  user_agent   TEXT
);

COMMENT ON TABLE public.partner_password_reset_tokens IS
  'P11.x — tokens de réinitialisation mot de passe partenaire. À usage unique, TTL 30 min.';

CREATE INDEX IF NOT EXISTS idx_partner_pw_reset_contact
  ON public.partner_password_reset_tokens (contact_id);

CREATE INDEX IF NOT EXISTS idx_partner_pw_reset_expires
  ON public.partner_password_reset_tokens (expires_at)
  WHERE used_at IS NULL;

-- ─── RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.partner_password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_partner_pw_reset"
  ON public.partner_password_reset_tokens
  FOR ALL
  TO service_role
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.partner_password_reset_tokens
  TO service_role;

-- ─── Enum audit_action — nouvelles valeurs P11.x ───────────────────

ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'partner_password_login';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'partner_password_set';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'partner_password_removed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'partner_password_reset_requested';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'partner_password_reset_consumed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'admin_triggered_partner_magic_link';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'admin_triggered_partner_password_reset';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'admin_removed_partner_password';
