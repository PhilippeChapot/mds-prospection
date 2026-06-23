-- P5.x.SellsyDocumentsFlow :
--   1. Contact de facturation + numéro de bon de commande sur prospects
--   2. Table document_requests : workflow de demande partenaire (proforma / facture)
--      validée par un admin avant émission Sellsy.

-- ============================================================
-- 1. CONTACT DE FACTURATION + BON DE COMMANDE sur prospects
-- ============================================================

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS billing_contact_id UUID
    REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_email_override TEXT NULL
    CHECK (
      billing_email_override IS NULL
      OR billing_email_override ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    ),
  ADD COLUMN IF NOT EXISTS purchase_order_number TEXT NULL
    CHECK (purchase_order_number IS NULL OR length(purchase_order_number) <= 100);

COMMENT ON COLUMN public.prospects.billing_contact_id IS
  'Contact de facturation : destinataire facture/pro-forma côté Sellsy. NULL = fallback primary_contact_id.';
COMMENT ON COLUMN public.prospects.billing_email_override IS
  'Email externe de facturation (ex: cabinet expert-comptable). Utilisé seulement si billing_contact_id est NULL.';
COMMENT ON COLUMN public.prospects.purchase_order_number IS
  'Numéro de bon de commande client, reporté dans la note du document Sellsy (facture).';

-- ============================================================
-- 2. TABLE document_requests (workflow demande partenaire)
-- ============================================================

CREATE TABLE public.document_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('proforma', 'invoice')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),

  -- Bon de commande (pertinent pour invoice uniquement)
  requires_purchase_order BOOLEAN NOT NULL DEFAULT false,
  purchase_order_number TEXT NULL CHECK (purchase_order_number IS NULL OR length(purchase_order_number) <= 100),

  -- Contact de facturation choisi par le partenaire (invoice) :
  --   (a) requested_billing_contact_id = self ou autre contact MDS de la company
  --   (b) requested_billing_email      = email externe (cabinet compta…)
  requested_billing_contact_id UUID NULL
    REFERENCES public.contacts(id) ON DELETE SET NULL,
  requested_billing_email TEXT NULL
    CHECK (
      requested_billing_email IS NULL
      OR requested_billing_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    ),

  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_note TEXT NULL CHECK (requested_note IS NULL OR length(requested_note) <= 1000),

  -- Décision admin
  decided_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NULL,
  decided_note TEXT NULL CHECK (decided_note IS NULL OR length(decided_note) <= 1000),

  -- Lien vers le doc émis (renseigné après approval)
  sellsy_document_id TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Si BC requis ET demande approuvée → numéro de BC obligatoire
  CONSTRAINT po_number_required_when_approved CHECK (
    status <> 'approved'
    OR requires_purchase_order = false
    OR purchase_order_number IS NOT NULL
  )
);

-- Index liste admin "demandes en attente"
CREATE INDEX idx_document_requests_pending
  ON public.document_requests(prospect_id, status)
  WHERE status = 'pending';

-- Index espace partenaire (mes demandes par contact)
CREATE INDEX idx_document_requests_contact
  ON public.document_requests(contact_id, requested_at DESC);

-- Anti-doublon : 1 seule demande pending par (prospect, contact, type)
CREATE UNIQUE INDEX uniq_document_request_pending
  ON public.document_requests(prospect_id, contact_id, document_type)
  WHERE status = 'pending';

-- RLS strict (doctrine RLS systématique : service_role only, accès via service client)
ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_document_requests"
  ON public.document_requests
  FOR ALL
  TO service_role
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_requests TO service_role;

COMMENT ON TABLE public.document_requests IS
  'Demandes de documents (pro-forma / facture) faites par les partenaires depuis l''espace partenaire, validées par un admin avant émission Sellsy. P5.x.SellsyDocumentsFlow';
