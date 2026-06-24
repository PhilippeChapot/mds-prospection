-- P12.x.EmailIntegrationIMAPSMTP : inbox unifiée IMAP/SMTP (V1 = Phil).
-- Credentials JAMAIS en base : seulement env_var_key → mots de passe en
-- variables d'environnement Vercel. RLS service_role only.

-- ============================================================
-- 1. email_accounts — config par user MDS
-- ============================================================
CREATE TABLE public.email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NULL,
  -- Préfixe env : mots de passe lus dans `${env_var_key}_IMAP_PASSWORD` /
  -- `${env_var_key}_SMTP_PASSWORD` (ex: IONOS_PHIL). Jamais le secret en base.
  env_var_key TEXT NOT NULL,
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL DEFAULT 993,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 465,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_uid BIGINT NULL,
  last_synced_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_email_accounts_email ON public.email_accounts (lower(email));

-- ============================================================
-- 2. emails — inbox unifiée (inbound + outbound) + threading
-- ============================================================
CREATE TABLE public.emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  imap_uid BIGINT NULL,
  message_id TEXT NULL,
  in_reply_to TEXT NULL,
  -- `references` est un mot réservé Postgres → email_references.
  email_references TEXT NULL,
  from_email TEXT NULL,
  from_name TEXT NULL,
  to_emails TEXT[] NOT NULL DEFAULT '{}',
  cc_emails TEXT[] NOT NULL DEFAULT '{}',
  bcc_emails TEXT[] NOT NULL DEFAULT '{}',
  subject TEXT NULL,
  snippet TEXT NULL,
  body_text TEXT NULL,
  body_html TEXT NULL,
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  received_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Dédup IMAP : un UID unique par compte (inbound). Outbound a imap_uid NULL.
CREATE UNIQUE INDEX uniq_emails_account_uid
  ON public.emails (account_id, imap_uid) WHERE imap_uid IS NOT NULL;
CREATE INDEX idx_emails_account_received ON public.emails (account_id, received_at DESC);
CREATE INDEX idx_emails_message_id ON public.emails (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_emails_in_reply_to ON public.emails (in_reply_to) WHERE in_reply_to IS NOT NULL;
CREATE INDEX idx_emails_unread ON public.emails (account_id) WHERE is_read = false;
CREATE INDEX idx_emails_from_lower ON public.emails (lower(from_email));

-- ============================================================
-- 3. email_links — auto-link prospect/contact/company
-- ============================================================
CREATE TABLE public.email_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  prospect_id UUID NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  contact_id UUID NULL REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 1.0,
  link_method TEXT NOT NULL CHECK (
    link_method IN ('contact_email_exact', 'company_domain', 'manual')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_links_email ON public.email_links (email_id);
CREATE INDEX idx_email_links_prospect ON public.email_links (prospect_id) WHERE prospect_id IS NOT NULL;
CREATE INDEX idx_email_links_contact ON public.email_links (contact_id) WHERE contact_id IS NOT NULL;
-- Anti-doublon lien prospect par email.
CREATE UNIQUE INDEX uniq_email_link_prospect
  ON public.email_links (email_id, prospect_id) WHERE prospect_id IS NOT NULL;

-- ============================================================
-- 4. email_attachments — référence Supabase Storage
-- ============================================================
CREATE TABLE public.email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NULL,
  size_bytes BIGINT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_attachments_email ON public.email_attachments (email_id);

-- ============================================================
-- 5. email_templates — V1 minimal
-- ============================================================
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NULL,
  locale TEXT NOT NULL DEFAULT 'fr',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS service_role only (doctrine RLS systématique)
-- ============================================================
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_email_accounts" ON public.email_accounts FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_emails" ON public.emails FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_email_links" ON public.email_links FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_email_attachments" ON public.email_attachments FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_email_templates" ON public.email_templates FOR ALL TO service_role USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emails TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_links TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_attachments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO service_role;

-- ============================================================
-- Storage bucket privé (signed URLs only)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Seed templates V1
-- ============================================================
INSERT INTO public.email_templates (key, name, subject, body_html, body_text) VALUES
  ('relance_devis', 'Relance devis', 'Votre devis MediaDays Solutions 2026',
   '<p>Bonjour {contact.first_name},</p><p>Je reviens vers vous concernant le devis pour {company.name} ({prospect.amount}). Restez-vous intéressé(e) par une participation à MediaDays Solutions 2026 ?</p><p>Bien à vous,<br/>Philippe Chapot</p>',
   'Bonjour {contact.first_name},\n\nJe reviens vers vous concernant le devis pour {company.name} ({prospect.amount}).\n\nPhilippe Chapot'),
  ('prise_contact', 'Prise de contact', 'MediaDays Solutions 2026 — échange',
   '<p>Bonjour {contact.first_name},</p><p>Je me permets de vous contacter au sujet de {company.name} et de votre éventuelle présence aux MediaDays Solutions 2026.</p><p>Philippe Chapot</p>',
   'Bonjour {contact.first_name},\n\nJe me permets de vous contacter au sujet de {company.name}.\n\nPhilippe Chapot'),
  ('remerciement', 'Remerciement', 'Merci — MediaDays Solutions 2026',
   '<p>Bonjour {contact.first_name},</p><p>Merci pour votre confiance. Nous sommes ravis de compter {company.name} parmi les partenaires 2026.</p><p>Philippe Chapot</p>',
   'Bonjour {contact.first_name},\n\nMerci pour votre confiance.\n\nPhilippe Chapot')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.emails IS 'P12.x — inbox unifiée IMAP/SMTP (PII tiers : RLS service_role, body sanitize côté UI).';
