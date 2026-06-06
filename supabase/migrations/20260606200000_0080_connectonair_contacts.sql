-- Migration 0080 — P5.x.ConnectOnAirContactsCache (V2)
--
-- V1 (livree commit 7ac1c18 + import 14 325 societes) : cache societes CoA
-- + cascade enrich Apollo/CoA cote companies.
--
-- V2 : etend l import aux contacts (cols 48-78 du XLSX) pour enrichir les
-- contacts MDS existants par matching email LOWER(TRIM) symetrique.
--
-- Decisions Cowork 2026-06-06 :
--   - Cas A uniquement : enrich contacts existants. PAS de cold email,
--     donc PAS de doctrine RGPD specifique pour V2.
--   - Volume attendu : ~25-28 000 contacts uniques apres dedup user_id.
--   - Matching key : email_normalized = LOWER(TRIM(email)) cote DB +
--     applicatif (etend la doctrine normalize-name-for-matching aux emails).

-- ─── Cleanup index doublon V1 ───
-- Les 2 partial unique indexes ci-dessous ont ete crees par 0076 (source_id
-- legacy) et 0078 (source_societe_id). 0078 a ajoute la cle metier
-- definitive. La contrainte UNIQUE applicative passe maintenant par
-- l upsert ON CONFLICT cote script ; on retire les 2 partial indexes
-- qui font doublon avec la cle metier.
drop index if exists public.uniq_coa_directory_source_id;
drop index if exists public.uniq_coa_directory_source_societe_id;

-- ─── Table connectonair_directory_contacts ───
create table if not exists public.connectonair_directory_contacts (
  id                  uuid primary key default gen_random_uuid(),

  -- Identifiants source CoA
  source_user_id      integer not null,                 -- col[49] user_id
  source_unik_id      text,                             -- col[69] unik_id

  -- FK metier vers societe (col[1] societe_id du XLSX, pas col[48] site_id).
  -- Pas de FK PostgreSQL stricte pour permettre l import contact meme si la
  -- societe parent est manquante (orphelin tolere). Le matching ulterieur
  -- via JOIN sur connectonair_directory.source_societe_id se fait quand
  -- meme correctement quand les 2 tables sont peuplees.
  coa_societe_id      text,

  -- Identite
  first_name          text,                             -- col[52] prenom
  last_name           text,                             -- col[51] nom
  civility            text,                             -- col[67] civilite
  genre               text,                             -- col[50]

  -- Contact direct
  email               text,                             -- col[64] mail (brut)
  email_normalized    text,                             -- LOWER(TRIM(email)) — CLE DE MATCH MDS
  email_valid         boolean,                          -- col[65] mail_valide
  email_additional    text,                             -- col[73] mail_additionnel
  phone               text,                             -- col[61] telephone
  mobile              text,                             -- col[62] mobil
  fax                 text,                             -- col[63]

  -- Profil metier
  role                text,                             -- col[77] fonction
  family_function     text,                             -- col[76] famillefonction
  type_profil         text,                             -- col[66]

  -- Adresse contact (parfois renseignee individuellement vs societe)
  address             text,                             -- col[53]
  address_2           text,                             -- col[54]
  address_3           text,                             -- col[55]
  address_complement  text,                             -- col[56]
  city                text,                             -- col[57]
  postal_code         text,                             -- col[58]
  state               text,                             -- col[59] etat
  country             text,                             -- col[60] (ISO normalise)

  -- Reseau / langue
  language            text,                             -- col[68] langue (fr/en/null)
  linkedin_url        text,                             -- col[75] linkedin_id

  -- RGPD / Brevo CoA (informatif, pas utilise V2)
  rgpd                boolean,                          -- col[70]
  send_in_blue        text,                             -- col[74] N/Y

  -- Tracking import
  raw_data            jsonb,                            -- snapshot cols 48-78
  source_created_at   timestamptz,                      -- col[71] date_create
  source_updated_at   timestamptz,                      -- col[72] date_update
  imported_at         timestamptz not null default now(),
  import_batch_id     uuid
);

-- Cle metier unique (pilote l upsert idempotent).
create unique index if not exists uniq_coa_contacts_source_user_id
  on public.connectonair_directory_contacts(source_user_id);

-- Index pour matching email (cle critique du cas d usage V2).
create index if not exists idx_coa_contacts_email_normalized
  on public.connectonair_directory_contacts(email_normalized)
  where email_normalized is not null;

-- Index pour join societe.
create index if not exists idx_coa_contacts_coa_societe_id
  on public.connectonair_directory_contacts(coa_societe_id)
  where coa_societe_id is not null;

-- Index pour tracking import.
create index if not exists idx_coa_contacts_imported_at
  on public.connectonair_directory_contacts(imported_at desc);

-- RLS [[feedback_rls_systematic]] : service_role only.
alter table public.connectonair_directory_contacts enable row level security;

drop policy if exists "service_role_all_coa_contacts" on public.connectonair_directory_contacts;
create policy "service_role_all_coa_contacts"
  on public.connectonair_directory_contacts
  for all
  to service_role
  using (true)
  with check (true);

-- GRANT [[reference_supabase_data_api_grants]].
grant select, insert, update, delete on public.connectonair_directory_contacts to service_role;

comment on table public.connectonair_directory_contacts is
  'Cache local des contacts ConnectOnAir importes depuis un XLSX (cols 48-78). Source pour enrichContactFromConnectOnAirAction. Matching avec contacts MDS via email_normalized.';
comment on column public.connectonair_directory_contacts.email_normalized is
  'LOWER(TRIM(email)) cote DB. Mirror du helper applicatif normalizeEmailForMatching. Cle critique du matching contact MDS <-> CoA.';
comment on column public.connectonair_directory_contacts.coa_societe_id is
  'FK metier vers connectonair_directory.source_societe_id (col[1] du XLSX, PAS col[48] site_id qui est constant=1).';

-- ─── Tracking enrichissement sur contacts MDS ───
-- Mirror du pattern companies.last_enrichment_source / last_enriched_at
-- (livre par migration 0076). Ajoute aussi linkedin_url car les contacts
-- MDS n en ont pas actuellement et CoA en fournit pour certains.
alter table public.contacts
  add column if not exists last_enrichment_source text
    check (
      last_enrichment_source in ('connectonair', 'apollo', 'manual')
      or last_enrichment_source is null
    ),
  add column if not exists last_enriched_at timestamptz,
  add column if not exists linkedin_url text;

create index if not exists idx_contacts_last_enriched
  on public.contacts(last_enriched_at desc)
  where last_enriched_at is not null;

comment on column public.contacts.last_enrichment_source is
  'Source du dernier enrichissement contact (P5.x.ConnectOnAirContactsCache V2).';
comment on column public.contacts.linkedin_url is
  'URL profil LinkedIn du contact, enrichie depuis ConnectOnAir (col[75] linkedin_id du XLSX). Optionnel.';
