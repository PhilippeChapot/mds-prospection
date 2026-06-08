-- Migration 0084 — P5.x.SearchFuzzy
--
-- Recherche admin case + accent insensible + suggestions "vouliez-vous
-- dire" (typos / espacement) sur companies, contacts, prospects.
--
-- Strategie :
--   1. Extensions unaccent + pg_trgm.
--   2. Wrapper IMMUTABLE pour unaccent (sinon impossible d indexer).
--   3. Indexes GIN trgm sur les colonnes search-relevantes (en passant
--      par unaccent+lower pour matcher l'usage frontend).
--   4. RPCs SQL : search_companies_fuzzy / search_contacts_fuzzy /
--      search_prospects_fuzzy qui retournent une UNION ALL :
--        - exact_matches : substring match insensible (ILIKE sur unaccent).
--        - suggestions   : pg_trgm similarity > 0.4 (excludes deja matchees).
--
-- Note sur le threshold : 0.4 est un compromis bon pour des noms de
-- societes 10-20 chars (Mediarun ↔ Media Speak similarity ~0.55,
-- Aircheck ↔ Aircheq ~0.43, garbage ↔ random ~0.05). Configurable
-- via SET LOCAL pg_trgm.similarity_threshold cote query si besoin.

-- ─── Extensions ───
-- Supabase install pg_trgm + unaccent dans le schema `extensions`, deja
-- present dans le search_path du role postgres. On ne prefixe donc PAS
-- gin_trgm_ops / unaccent (sinon ERROR 42704 "operator class
-- public.gin_trgm_ops does not exist").
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- ─── Wrapper IMMUTABLE pour unaccent (requis pour indexer) ───
-- L unaccent natif est STABLE (depend du dictionnaire). On wrap pour
-- forcer IMMUTABLE (acceptable car unaccent ne change pas en pratique).
-- Le SET search_path est defensif : il fige la resolution dans le corps
-- de la fonction au cas ou un appelant aurait un search_path different.
create or replace function public.f_unaccent(text)
  returns text
  as $$ select unaccent('unaccent'::regdictionary, $1) $$
  language sql
  immutable
  parallel safe
  strict
  set search_path = extensions, public, pg_temp;

-- ─── Indexes GIN trigram ───
-- Permet ILIKE rapide + operator % (similarity) sur ces colonnes.
-- Tailles attendues sur la volumetrie MDS : quelques MB par index,
-- acceptable.

create index if not exists idx_companies_name_trgm
  on public.companies
  using gin (public.f_unaccent(lower(name)) gin_trgm_ops);

create index if not exists idx_companies_website_trgm
  on public.companies
  using gin (public.f_unaccent(lower(coalesce(website, ''))) gin_trgm_ops)
  where website is not null;

create index if not exists idx_companies_primary_domain_trgm
  on public.companies
  using gin (public.f_unaccent(lower(coalesce(primary_domain, ''))) gin_trgm_ops)
  where primary_domain is not null;

create index if not exists idx_contacts_full_name_trgm
  on public.contacts
  using gin (public.f_unaccent(lower(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) gin_trgm_ops);

create index if not exists idx_contacts_email_trgm
  on public.contacts
  using gin (public.f_unaccent(lower(email)) gin_trgm_ops);

-- ─── RPC : search_companies_fuzzy ───
-- Retourne exact_matches (substring insensible) + suggestions (trgm).
-- limit_exact = nb max d exact matches, limit_fuzzy = nb max suggestions.

create or replace function public.search_companies_fuzzy(
  p_query text,
  p_limit_exact integer default 50,
  p_limit_fuzzy integer default 5
)
returns table (
  id uuid,
  name text,
  primary_domain text,
  website text,
  pole_id uuid,
  match_type text,
  score real
)
language sql
stable
parallel safe
as $$
  with q as (
    select public.f_unaccent(lower(trim(p_query))) as norm
  ),
  exact_matches as (
    select
      c.id,
      c.name,
      c.primary_domain,
      c.website,
      c.pole_id,
      'exact'::text as match_type,
      1.0::real as score
    from public.companies c, q
    where length(q.norm) >= 2
      and (
        public.f_unaccent(lower(c.name)) like '%' || q.norm || '%'
        or public.f_unaccent(lower(coalesce(c.primary_domain, ''))) like '%' || q.norm || '%'
        or public.f_unaccent(lower(coalesce(c.website, ''))) like '%' || q.norm || '%'
      )
    order by
      -- Boost les rows ou le name commence par q.norm (plus pertinent).
      case when public.f_unaccent(lower(c.name)) like q.norm || '%' then 0 else 1 end,
      c.name
    limit p_limit_exact
  ),
  fuzzy_suggestions as (
    select
      c.id,
      c.name,
      c.primary_domain,
      c.website,
      c.pole_id,
      'fuzzy'::text as match_type,
      similarity(public.f_unaccent(lower(c.name)), q.norm) as score
    from public.companies c, q
    where length(q.norm) >= 2
      and public.f_unaccent(lower(c.name)) % q.norm
      and c.id not in (select id from exact_matches)
    order by score desc
    limit p_limit_fuzzy
  )
  select * from exact_matches
  union all
  select * from fuzzy_suggestions;
$$;

-- ─── RPC : search_contacts_fuzzy ───
-- Similaire mais cote contacts (search email + full_name).

create or replace function public.search_contacts_fuzzy(
  p_query text,
  p_limit_exact integer default 50,
  p_limit_fuzzy integer default 5
)
returns table (
  id uuid,
  email text,
  first_name text,
  last_name text,
  company_id uuid,
  match_type text,
  score real
)
language sql
stable
parallel safe
as $$
  with q as (
    select public.f_unaccent(lower(trim(p_query))) as norm
  ),
  exact_matches as (
    select
      c.id,
      c.email,
      c.first_name,
      c.last_name,
      c.company_id,
      'exact'::text as match_type,
      1.0::real as score
    from public.contacts c, q
    where length(q.norm) >= 2
      and (
        public.f_unaccent(lower(c.email)) like '%' || q.norm || '%'
        or public.f_unaccent(lower(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) like '%' || q.norm || '%'
      )
    order by c.email
    limit p_limit_exact
  ),
  fuzzy_suggestions as (
    select
      c.id,
      c.email,
      c.first_name,
      c.last_name,
      c.company_id,
      'fuzzy'::text as match_type,
      greatest(
        similarity(public.f_unaccent(lower(c.email)), q.norm),
        similarity(public.f_unaccent(lower(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))), q.norm)
      ) as score
    from public.contacts c, q
    where length(q.norm) >= 2
      and (
        public.f_unaccent(lower(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) % q.norm
        or public.f_unaccent(lower(c.email)) % q.norm
      )
      and c.id not in (select id from exact_matches)
    order by score desc
    limit p_limit_fuzzy
  )
  select * from exact_matches
  union all
  select * from fuzzy_suggestions;
$$;

-- ─── RPC : search_prospects_fuzzy ───
-- Cherche les prospects via le nom de la company associee (le seul
-- texte search-pertinent cote prospect lui-meme = pas grand chose).

create or replace function public.search_prospects_fuzzy(
  p_query text,
  p_limit_exact integer default 50,
  p_limit_fuzzy integer default 5
)
returns table (
  id uuid,
  company_id uuid,
  company_name text,
  status text,
  match_type text,
  score real
)
language sql
stable
parallel safe
as $$
  with q as (
    select public.f_unaccent(lower(trim(p_query))) as norm
  ),
  exact_matches as (
    select
      p.id,
      p.company_id,
      c.name as company_name,
      p.status::text,
      'exact'::text as match_type,
      1.0::real as score
    from public.prospects p
    join public.companies c on c.id = p.company_id, q
    where length(q.norm) >= 2
      and public.f_unaccent(lower(c.name)) like '%' || q.norm || '%'
    order by c.name
    limit p_limit_exact
  ),
  fuzzy_suggestions as (
    select
      p.id,
      p.company_id,
      c.name as company_name,
      p.status::text,
      'fuzzy'::text as match_type,
      similarity(public.f_unaccent(lower(c.name)), q.norm) as score
    from public.prospects p
    join public.companies c on c.id = p.company_id, q
    where length(q.norm) >= 2
      and public.f_unaccent(lower(c.name)) % q.norm
      and p.id not in (select id from exact_matches)
    order by score desc
    limit p_limit_fuzzy
  )
  select * from exact_matches
  union all
  select * from fuzzy_suggestions;
$$;

-- ─── GRANT execute aux roles applicatifs ───
grant execute on function public.f_unaccent(text) to service_role, authenticated;
grant execute on function public.search_companies_fuzzy(text, integer, integer) to service_role, authenticated;
grant execute on function public.search_contacts_fuzzy(text, integer, integer) to service_role, authenticated;
grant execute on function public.search_prospects_fuzzy(text, integer, integer) to service_role, authenticated;

comment on function public.f_unaccent(text) is
  'P5.x.SearchFuzzy — wrapper IMMUTABLE de unaccent() pour usage dans les indexes GIN trgm.';
comment on function public.search_companies_fuzzy(text, integer, integer) is
  'P5.x.SearchFuzzy — exact substring match (unaccent+lower) UNION ALL fuzzy pg_trgm similarity > 0.3 default. Exact prioritaire (score=1.0), fuzzy trie par similarity desc.';
comment on function public.search_contacts_fuzzy(text, integer, integer) is
  'P5.x.SearchFuzzy — recherche fuzzy contacts via email + full_name (unaccent+lower).';
comment on function public.search_prospects_fuzzy(text, integer, integer) is
  'P5.x.SearchFuzzy — recherche fuzzy prospects via le nom de la company associee.';
