-- 0094: P15.1.VisitorModel
--
-- Modèle DB des VISITEURS du salon MDS 2026 (distinct des PROSPECTS partenaires).
--   - visitors                       : table principale, FK UNIQUE -> contacts
--   - visitor_invitation_data        : data lettre d'invitation / visa (rempli P15.4)
--   - visitor_accounts               : auth espace visiteur (pattern P11.x partenaire)
--   - visitor_password_reset_tokens  : tokens reset password visiteur (pattern P11.x)
--
-- + SHELLS pour P16 (aucune UI/logique livrée en P15.1) :
--   - speakers, conferences, conference_speakers
--
-- Décisions Phil :
--   - Table SÉPARÉE avec FK unique -> contacts (une personne peut être visiteur
--     ET partenaire). Conversion croisée = ADD une row (historique préservé).
--
-- NOTE updated_at : ce repo n'a PAS de fonction update_updated_at_column()
-- (cf. 0085 : « on gère updated_at directement dans les server actions »).
-- On suit cette doctrine ici → AUCUN trigger, updated_at géré côté actions.

-- =====================================================================
-- TABLE PRINCIPALE : visitors
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.visitors (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id                  UUID UNIQUE NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id                  UUID REFERENCES public.companies(id) ON DELETE SET NULL,

  -- Catégorisation. `pole` stocke un code aligné sur design-tokens POLE_CODES
  -- (REGIES_RETAIL_MEDIA, AUDIO_RADIO, ...). TEXT pour rester souple ; validé
  -- côté server action (Zod) contre la liste partagée.
  pole                        TEXT,
  visitor_type                TEXT CHECK (visitor_type IN ('professional','press','student','vip','speaker','other') OR visitor_type IS NULL),
  is_vip                      BOOLEAN NOT NULL DEFAULT false,

  -- Tracking provenance
  source                      TEXT NOT NULL DEFAULT 'manual_admin' CHECK (source IN (
    'manual_admin',
    'signup_web',
    'converted_from_prospect',
    'import_xlsx',
    'cold_email_received',
    'apollo_smart_add'
  )),

  status                      TEXT NOT NULL DEFAULT 'lead' CHECK (status IN (
    'lead',
    'invited',
    'confirmed',
    'attended',
    'no_show',
    'cancelled'
  )),

  -- Conversion (si issu d'un prospect)
  former_prospect_id          UUID REFERENCES public.prospects(id) ON DELETE SET NULL,

  -- Préférences générales
  language                    TEXT NOT NULL DEFAULT 'fr' CHECK (language IN ('fr','en','es','de')),

  -- Ownership. -> public.users (staff) pour permettre l'embed PostgREST
  -- `owner:users!visitors_owner_user_id_fkey(...)`, comme prospects.owner_id.
  owner_user_id               UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Brevo sync (rempli plus tard par P15.5)
  brevo_synced_at             TIMESTAMPTZ,
  brevo_list_id               TEXT,

  -- Notes admin
  notes                       TEXT,

  -- Big Co alerte (rempli plus tard si Apollo > 1000 emp)
  is_big_company              BOOLEAN NOT NULL DEFAULT false,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitors_contact_id ON public.visitors(contact_id);
CREATE INDEX IF NOT EXISTS idx_visitors_company_id ON public.visitors(company_id);
CREATE INDEX IF NOT EXISTS idx_visitors_pole ON public.visitors(pole) WHERE pole IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visitors_status ON public.visitors(status);
CREATE INDEX IF NOT EXISTS idx_visitors_owner ON public.visitors(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_visitors_vip ON public.visitors(is_vip) WHERE is_vip = true;

ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_visitors" ON public.visitors FOR ALL TO service_role USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitors TO service_role;


-- =====================================================================
-- TABLE INVITATION VISA : visitor_invitation_data
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.visitor_invitation_data (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id                  UUID UNIQUE NOT NULL REFERENCES public.visitors(id) ON DELETE CASCADE,

  -- Passeport (rempli par le visiteur dans l'espace public)
  passport_number             TEXT,
  passport_country            TEXT,  -- ISO 3166-1 alpha-2
  passport_expiry             DATE,
  birth_date                  DATE,
  birth_place                 TEXT,

  -- Voyage
  arrival_date                DATE,
  departure_date              DATE,
  flight_in                   TEXT,
  flight_out                  TEXT,

  -- Hébergement
  hotel_name                  TEXT,
  hotel_address               TEXT,

  -- Génération lettre (rempli par P15.4)
  pdf_storage_path            TEXT,
  pdf_generated_at            TIMESTAMPTZ,
  pdf_generated_by            UUID REFERENCES public.users(id),

  -- Status visa
  visa_status                 TEXT CHECK (visa_status IN ('not_needed','submitted','granted','refused','unknown') OR visa_status IS NULL),

  -- Workflow approval (rempli par P15.4)
  approval_status             TEXT CHECK (approval_status IN ('pending','approved','rejected','auto_approved') OR approval_status IS NULL),
  approved_by                 UUID REFERENCES public.users(id),
  approved_at                 TIMESTAMPTZ,
  rejection_reason            TEXT,

  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitor_invitation_visitor ON public.visitor_invitation_data(visitor_id);

ALTER TABLE public.visitor_invitation_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_invitation" ON public.visitor_invitation_data FOR ALL TO service_role USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_invitation_data TO service_role;


-- =====================================================================
-- TABLE AUTH : visitor_accounts (pattern P11.x partenaire)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.visitor_accounts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id                  UUID UNIQUE NOT NULL REFERENCES public.visitors(id) ON DELETE CASCADE,
  email                       TEXT NOT NULL UNIQUE,
  password_hash               TEXT,  -- nullable (set via flow P11.x pattern)
  password_set_at             TIMESTAMPTZ,
  last_login_at               TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitor_accounts_email ON public.visitor_accounts(email);

ALTER TABLE public.visitor_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_visitor_accounts" ON public.visitor_accounts FOR ALL TO service_role USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_accounts TO service_role;


-- =====================================================================
-- TABLE TOKENS RESET PASSWORD VISITEUR (pattern P11.x)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.visitor_password_reset_tokens (
  token                       TEXT PRIMARY KEY,
  visitor_account_id          UUID NOT NULL REFERENCES public.visitor_accounts(id) ON DELETE CASCADE,
  expires_at                  TIMESTAMPTZ NOT NULL,
  used_at                     TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitor_reset_tokens_account ON public.visitor_password_reset_tokens(visitor_account_id);
CREATE INDEX IF NOT EXISTS idx_visitor_reset_tokens_expires ON public.visitor_password_reset_tokens(expires_at) WHERE used_at IS NULL;

ALTER TABLE public.visitor_password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_visitor_reset_tokens" ON public.visitor_password_reset_tokens FOR ALL TO service_role USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_password_reset_tokens TO service_role;


-- =====================================================================
-- SHELL Speakers (UI + logique complète en P16)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.speakers (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id                  UUID UNIQUE NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id                  UUID REFERENCES public.companies(id) ON DELETE SET NULL,

  speaker_type                TEXT CHECK (speaker_type IN ('keynote','panel','masterclass','workshop','moderator') OR speaker_type IS NULL),
  status                      TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','contacted','confirmed','declined','cancelled')),

  bio_short                   TEXT,
  topics                      TEXT[],

  language                    TEXT NOT NULL DEFAULT 'fr' CHECK (language IN ('fr','en','es','de')),

  owner_user_id               UUID REFERENCES public.users(id) ON DELETE SET NULL,

  notes                       TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_speakers_contact_id ON public.speakers(contact_id);
CREATE INDEX IF NOT EXISTS idx_speakers_company_id ON public.speakers(company_id);
CREATE INDEX IF NOT EXISTS idx_speakers_status ON public.speakers(status);
CREATE INDEX IF NOT EXISTS idx_speakers_type ON public.speakers(speaker_type) WHERE speaker_type IS NOT NULL;

ALTER TABLE public.speakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_speakers" ON public.speakers FOR ALL TO service_role USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speakers TO service_role;


-- =====================================================================
-- SHELL Conferences (programme des sessions, UI en P16)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.conferences (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  title_fr                    TEXT NOT NULL,
  title_en                    TEXT,
  description_fr              TEXT,
  description_en              TEXT,

  conference_type             TEXT CHECK (conference_type IN ('keynote','panel','masterclass','workshop','networking') OR conference_type IS NULL),

  start_at                    TIMESTAMPTZ,
  end_at                      TIMESTAMPTZ,
  room                        TEXT,
  city                        TEXT,
  capacity                    INT,

  is_published                BOOLEAN NOT NULL DEFAULT false,

  poles                       TEXT[],

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conferences_start_at ON public.conferences(start_at);
CREATE INDEX IF NOT EXISTS idx_conferences_city ON public.conferences(city);
CREATE INDEX IF NOT EXISTS idx_conferences_published ON public.conferences(is_published);

ALTER TABLE public.conferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_conferences" ON public.conferences FOR ALL TO service_role USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conferences TO service_role;


-- =====================================================================
-- TABLE JONCTION : conference_speakers (N-N)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.conference_speakers (
  conference_id               UUID NOT NULL REFERENCES public.conferences(id) ON DELETE CASCADE,
  speaker_id                  UUID NOT NULL REFERENCES public.speakers(id) ON DELETE CASCADE,
  role                        TEXT CHECK (role IN ('keynote_speaker','panelist','moderator','expert','host') OR role IS NULL),
  speaking_order              INT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conference_id, speaker_id)
);

CREATE INDEX IF NOT EXISTS idx_conference_speakers_speaker ON public.conference_speakers(speaker_id);

ALTER TABLE public.conference_speakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_conference_speakers" ON public.conference_speakers FOR ALL TO service_role USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conference_speakers TO service_role;
