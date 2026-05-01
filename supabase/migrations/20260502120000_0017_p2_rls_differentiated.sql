-- ============================================================================
-- 0017 — P2 M1 : RLS differenciee admin vs sales sur prospects/companies/
-- contacts/activities + helpers SECURITY DEFINER inline.
--
-- BUG FIX P1 — Le wrapper public.is_admin_or_sales() etait declare en
--   LANGUAGE SQL STABLE (sans SECURITY DEFINER) et appelait
--   private.is_admin_or_sales(uid) qui, lui, etait DEFINER. Quand une
--   policy invoquait le wrapper, l'execution restait dans le contexte
--   de l'appelant qui n'a pas necessairement les droits sur le schema
--   `private` -> la fonction retournait silencieusement false -> RLS
--   refusait toutes les operations.
--
-- FIX : on inline le check directement dans public.is_admin_or_sales()
-- en SECURITY DEFINER. On ajoute public.is_admin() avec le meme
-- pattern pour les operations restreintes admin (DELETE prospects,
-- UPDATE/DELETE companies).
--
-- Modele d'acces P2 :
--   companies   : admin ALL ; sales SELECT + INSERT (pas UPDATE/DELETE)
--   contacts    : admin ALL ; sales SELECT/INSERT/UPDATE (pas DELETE)
--   prospects   : admin ALL ; sales SELECT/INSERT/UPDATE de SES prospects
--                 (owner_id = uid OR affiliate_id = uid). Pas de DELETE sales.
--   activities  : admin ALL ; sales SELECT/INSERT sur les activities des
--                 prospects qu'il possede.
--
-- L'absence de policy sales pour DELETE = deny par defaut (RLS strict).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helpers SECURITY DEFINER inline (remplace l'aller-retour public->private)
-- ----------------------------------------------------------------------------

create or replace function public.is_admin_or_sales()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role in ('admin', 'sales')
  );
$$;

-- ALTER explicite : CREATE OR REPLACE FUNCTION ne change pas le mode SECURITY
-- sur certaines versions de Postgres. On force pour etre certain.
alter function public.is_admin_or_sales() security definer;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
  );
$$;

alter function public.is_admin() security definer;

grant execute on function public.is_admin_or_sales() to authenticated, anon;
grant execute on function public.is_admin() to authenticated;

-- L'ancienne fonction privee n'est plus referencee.
drop function if exists private.is_admin_or_sales(uuid);

-- ----------------------------------------------------------------------------
-- 2. COMPANIES — admin ALL, sales SELECT + INSERT
-- ----------------------------------------------------------------------------
drop policy if exists "companies_admin" on public.companies;

create policy "companies_admin_all"
  on public.companies for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "companies_sales_select"
  on public.companies for select
  to authenticated
  using (public.is_admin_or_sales());

create policy "companies_sales_insert"
  on public.companies for insert
  to authenticated
  with check (public.is_admin_or_sales());

-- Pas de policy sales pour UPDATE ni DELETE -> deny par defaut.

-- ----------------------------------------------------------------------------
-- 3. CONTACTS — admin ALL, sales SELECT + INSERT + UPDATE (pas DELETE)
-- ----------------------------------------------------------------------------
drop policy if exists "contacts_admin" on public.contacts;

create policy "contacts_admin_all"
  on public.contacts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "contacts_sales_select"
  on public.contacts for select
  to authenticated
  using (public.is_admin_or_sales());

create policy "contacts_sales_insert"
  on public.contacts for insert
  to authenticated
  with check (public.is_admin_or_sales());

create policy "contacts_sales_update"
  on public.contacts for update
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ----------------------------------------------------------------------------
-- 4. PROSPECTS — admin ALL, sales seulement les prospects qu'il possede
-- (owner_id = uid OR affiliate_id = uid). Pas de DELETE sales.
-- ----------------------------------------------------------------------------
drop policy if exists "prospects_admin" on public.prospects;

create policy "prospects_admin_all"
  on public.prospects for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "prospects_sales_select"
  on public.prospects for select
  to authenticated
  using (
    public.is_admin_or_sales()
    and (owner_id = auth.uid() or affiliate_id = auth.uid())
  );

-- INSERT : sales ne peut creer un prospect que pour lui-meme (owner_id = uid).
create policy "prospects_sales_insert"
  on public.prospects for insert
  to authenticated
  with check (
    public.is_admin_or_sales()
    and owner_id = auth.uid()
  );

create policy "prospects_sales_update"
  on public.prospects for update
  to authenticated
  using (
    public.is_admin_or_sales()
    and (owner_id = auth.uid() or affiliate_id = auth.uid())
  )
  with check (
    public.is_admin_or_sales()
    and (owner_id = auth.uid() or affiliate_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 5. ACTIVITIES — admin ALL, sales SELECT/INSERT sur ses prospects
-- ----------------------------------------------------------------------------
drop policy if exists "activities_admin" on public.activities;

create policy "activities_admin_all"
  on public.activities for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "activities_sales_select"
  on public.activities for select
  to authenticated
  using (
    public.is_admin_or_sales()
    and exists (
      select 1
      from public.prospects p
      where p.id = activities.prospect_id
        and (p.owner_id = auth.uid() or p.affiliate_id = auth.uid())
    )
  );

create policy "activities_sales_insert"
  on public.activities for insert
  to authenticated
  with check (
    public.is_admin_or_sales()
    and exists (
      select 1
      from public.prospects p
      where p.id = activities.prospect_id
        and (p.owner_id = auth.uid() or p.affiliate_id = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Note : audit_log est read-only via la policy audit_log_admin_read existante
-- (cf. migration 0015). Pas de modification ici. is_admin_or_sales() est
-- maintenant SECURITY DEFINER inline -> les filtres /admin/audit fonctionneront.
-- ----------------------------------------------------------------------------
