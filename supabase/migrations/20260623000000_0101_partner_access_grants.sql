-- P11.x.MultiPartnerAccess : table dédiée accès espace partenaire (1 company → N contacts)

CREATE TABLE public.partner_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'collaborator'
    CHECK (role IN ('owner', 'collaborator', 'viewer')),
  granted_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL,
  revoked_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  last_login_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un contact a au max 1 grant ACTIF (revoked_at IS NULL) à la fois
CREATE UNIQUE INDEX uniq_partner_grant_active_contact
  ON public.partner_access_grants(contact_id)
  WHERE revoked_at IS NULL;

-- Index recherche par company
CREATE INDEX idx_partner_grants_company ON public.partner_access_grants(company_id)
  WHERE revoked_at IS NULL;

-- RLS strict (doctrine feedback_rls_systematic)
ALTER TABLE public.partner_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_partner_grants"
  ON public.partner_access_grants
  FOR ALL
  TO service_role
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_access_grants TO service_role;

-- BACKFILL : un grant 'owner' pour chaque primary_contact_id de prospect signé
-- signed_at IS NOT NULL couvre les prospects signés avant l'introduction du champ status
INSERT INTO public.partner_access_grants (contact_id, company_id, role, granted_at, notes)
SELECT DISTINCT ON (p.primary_contact_id)
  p.primary_contact_id,
  p.company_id,
  'owner',
  COALESCE(p.signed_at, p.updated_at, now()) AS granted_at,
  'Auto-migré depuis prospects.status=' || p.status AS notes
FROM public.prospects p
WHERE p.primary_contact_id IS NOT NULL
  AND p.company_id IS NOT NULL
  AND p.status IN ('signe', 'acompte_paye', 'paye_integral')
ON CONFLICT (contact_id) WHERE revoked_at IS NULL DO NOTHING;

COMMENT ON TABLE public.partner_access_grants IS
  'Permet à plusieurs contacts d''une même company d''accéder à l''espace partenaire (multi-accès). P11.x.MultiPartnerAccess';
