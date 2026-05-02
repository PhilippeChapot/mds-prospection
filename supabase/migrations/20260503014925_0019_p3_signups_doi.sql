-- ============================================================================
-- 0019 — P3 M1 : enrichissement public_signup_attempts pour le DOI + Cas A/B
--                + RLS resserree (admin only) + cle Canva dans app_settings.
--
-- Decisions :
--   - On ETEND la table public_signup_attempts existante (creee en 0006)
--     plutot que de creer une nouvelle table `signups`. Le nom historique
--     decrit mieux la realite metier (= une tentative avant DOI).
--   - On AJOUTE la colonne `doi_token text UNIQUE` (JWT HS256 signe). On
--     conserve l'ancienne `verification_token uuid` pour compat, mais elle
--     n'est plus alimentee en P3.
--   - On ETEND l'enum `signup_status` avec 2 valeurs P3-only : step2_started,
--     step2_completed. Les valeurs existantes (awaiting_verification,
--     verified, expired, rejected, converted) couvrent deja le reste du cycle.
--   - On REMPLACE la policy admin "is_admin_or_sales" par "is_admin" sur
--     public_signup_attempts : la moderation des signups est une operation
--     reservee admin (le sales reprend a partir d'un prospect cree).
--     Helper is_admin() vient de 0017 (SECURITY DEFINER inline).
--   - On INSERT dans app_settings une cle `canva_md26_plan_url` (placeholder
--     vide). Le script `pnpm canva:resolve` (M1.6) remplit la valeur en
--     suivant la 301 du shortlink https://canva.link/md26plan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extension de l'enum signup_status (idempotent : IF NOT EXISTS).
--    Note : ces nouvelles valeurs ne peuvent PAS etre referencees dans la
--    meme transaction qui les ajoute (limite Postgres). On ne les utilise
--    qu'en runtime applicatif, donc OK.
-- ----------------------------------------------------------------------------
alter type public.signup_status add value if not exists 'step2_started';
alter type public.signup_status add value if not exists 'step2_completed';

-- ----------------------------------------------------------------------------
-- 2. Colonnes P3 sur public_signup_attempts.
-- ----------------------------------------------------------------------------
alter table public.public_signup_attempts
  add column if not exists category text
    check (category is null or category in ('exposant', 'partenaire')),
  add column if not exists step2_payload jsonb,
  add column if not exists step2_submitted_at timestamptz,
  add column if not exists doi_token text,
  add column if not exists doi_token_expires_at timestamptz,
  add column if not exists neverbounce_result text,
  add column if not exists referrer text;

create unique index if not exists signup_attempts_doi_token_unique
  on public.public_signup_attempts (doi_token)
  where doi_token is not null;

create index if not exists signup_attempts_category_idx
  on public.public_signup_attempts (category)
  where category is not null;

comment on column public.public_signup_attempts.category is
  'Categorie declaree a l''etape 1 (exposant | partenaire). Distincte de derived_category (calculee).';
comment on column public.public_signup_attempts.step2_payload is
  'Snapshot JSON des reponses de l''etape 2 (Cas A : pack/booth/options/payment ; Cas B : projet/budget/notes).';
comment on column public.public_signup_attempts.doi_token is
  'JWT HS256 signe (DOI_JWT_SECRET) avec sub=signup_id, email, jti. TTL 24h. Remplace verification_token (UUID legacy P0).';
comment on column public.public_signup_attempts.doi_token_expires_at is
  'Date d''expiration du doi_token (denormalisee depuis le claim exp pour faciliter les requetes).';
comment on column public.public_signup_attempts.neverbounce_result is
  'Resultat brut NeverBounce (valid|invalid|disposable|catchall|unknown). Conserve pour audit.';
comment on column public.public_signup_attempts.referrer is
  'document.referrer capture cote client a l''etape 1 (best effort).';

-- ----------------------------------------------------------------------------
-- 3. RLS — admin only sur SELECT/UPDATE/DELETE.
--    On garde la policy anon_insert (formulaire public) et anon_select_by_token
--    (verify DOI cote client si besoin un jour, P3 utilise serveur).
-- ----------------------------------------------------------------------------
drop policy if exists "signup_attempts_admin" on public.public_signup_attempts;

create policy "signup_attempts_admin_select"
  on public.public_signup_attempts for select
  to authenticated
  using (public.is_admin());

create policy "signup_attempts_admin_update"
  on public.public_signup_attempts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "signup_attempts_admin_delete"
  on public.public_signup_attempts for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. App_settings : placeholder pour l'URL Canva longue.
--    A remplir une fois via `pnpm canva:resolve` (script M1.6) qui suit la
--    301 du shortlink. Update SQL manuel possible si Canva change l'URL.
-- ----------------------------------------------------------------------------
insert into public.app_settings (key, value, description, category)
values (
  'canva_md26_plan_url',
  '""'::jsonb,
  'URL longue Canva (resolved depuis https://canva.link/md26plan) pour iframe embed du plan PRS 2026 — Cas A etape 2.',
  'general'
)
on conflict (key) do nothing;

comment on column public.app_settings.value is
  'Valeur JSON de la cle (string, number, object, array). Pour les URLs : JSON string ("https://...").';
