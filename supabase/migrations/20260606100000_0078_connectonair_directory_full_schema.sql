-- Migration 0078 — P5.x.ConnectOnAirDirectoryCache (Phase 1 — script d import)
--
-- Le schema initial 0076 etait minimaliste (8 colonnes). Le brief enrichi
-- 2026-06-06 (mapping XLSX confirme avec 79 colonnes header) demande de
-- conserver beaucoup plus de champs pour permettre :
--   - Identification distincte societe vs unik (CoA expose les deux).
--   - Filtres metier (est_radio, est_public, type_exposant).
--   - Reseaux sociaux + activites/produits/marques pour la recherche
--     interne ulterieure.
--   - Traque source_updated_at pour detecter les rows obsoletes.
--
-- Strategie : migration additive, table vide en prod (rien n a encore ete
-- importe). On garde `source_id` (legacy 0076) nullable pour eviter tout
-- breaking change sur l action enrich existante, et on ajoute la nouvelle
-- cle metier `source_societe_id` (UNIQUE) qui pilote l upsert idempotent
-- du script.

alter table public.connectonair_directory
  add column if not exists source_societe_id text,
  add column if not exists source_unik_id text,
  add column if not exists name_abrege text,
  add column if not exists sigle text,
  add column if not exists forme_juridique text,
  add column if not exists siret text,
  add column if not exists address_complement text,
  add column if not exists country_code text,
  add column if not exists fax text,
  add column if not exists est_radio boolean,
  add column if not exists est_public boolean,
  add column if not exists categorie text,
  add column if not exists type_exposant text,
  add column if not exists keyword text,
  add column if not exists instagram_url text,
  add column if not exists facebook_url text,
  add column if not exists twitter_url text,
  add column if not exists linkedin_url text,
  add column if not exists activites text,
  add column if not exists produits text,
  add column if not exists marques text,
  add column if not exists frequences text,
  add column if not exists source_updated_at timestamptz;

-- Index sur source_societe_id (UNIQUE quand present) pour upsert idempotent.
create unique index if not exists uniq_coa_directory_source_societe_id
  on public.connectonair_directory(source_societe_id)
  where source_societe_id is not null;

-- Index secondaires utiles a la search interne (admin V2).
create index if not exists idx_coa_directory_est_radio
  on public.connectonair_directory(est_radio)
  where est_radio is true;

create index if not exists idx_coa_directory_country
  on public.connectonair_directory(country)
  where country is not null;

create index if not exists idx_coa_directory_source_updated_at
  on public.connectonair_directory(source_updated_at desc)
  where source_updated_at is not null;

-- Commentaires de doc des nouveaux champs.
comment on column public.connectonair_directory.source_societe_id is
  'Cle metier ConnectOnAir (col [1] du XLSX). UNIQUE — pilote l upsert idempotent du script d import.';
comment on column public.connectonair_directory.source_unik_id is
  'Identifiant interne CoA unik_id (col [27]). Non-unique cote MDS (peut etre dupplique entre societes).';
comment on column public.connectonair_directory.est_radio is
  'Flag CoA : la societe est une radio (booleen). Utile pour filtrer l ecosysteme radio FR.';
comment on column public.connectonair_directory.activites is
  'Texte libre CoA decrivant les activites (ex: radio/podcast/regie/etc.). Indexable plus tard si besoin.';
comment on column public.connectonair_directory.source_updated_at is
  'Date_de_maj CoA (col [17]) — permet de detecter les rows obsoletes lors d un re-import.';

-- Le champ legacy `source_id` (0076) reste nullable, sans contrainte. Il
-- pourra etre supprime dans une migration ulterieure une fois confirme
-- qu aucun code ne le consomme (verifie 2026-06-06 : action lit name +
-- normalized_name + address + city + postal_code + country + phone +
-- website, jamais source_id).
