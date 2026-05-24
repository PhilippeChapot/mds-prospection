-- Migration 0054 — P7.x.1.F-quater
--
-- Bug critique : les helpers RLS `public.is_admin()` / `public.is_admin_or_
-- sales()` / `private.is_admin_or_sales(uuid)` (crees en migration 0015 +
-- 0017) check strictement `role IN ('admin','sales')` au niveau DB.
--
-- Un user promu `super_admin` (enum etendu en migration 0053 / P7.x.1.F)
-- est donc rejete par TOUTES les RLS policies qui passent par ces helpers
-- -> aucune ligne visible sur prospects, signups, audit_log, etc. C'est
-- pourquoi Phil voyait "0 inscriptions" sur /admin/signups apres sa
-- promotion super_admin.
--
-- P7.x.1.F-ter avait fix le check au niveau app (helper hasAdminAccess
-- + 37 fichiers touches), mais les fonctions SQL restaient au check
-- ancien. Cette migration les aligne.
--
-- Doctrine : `super_admin` = `admin++` (acces admin standard + actions
-- destructives gated par `requireSuperAdmin()` cote app).

-- 1. private.is_admin_or_sales(uid) -- helper SECURITY DEFINER appele
--    par les policies RLS via le wrapper public.is_admin_or_sales().
create or replace function private.is_admin_or_sales(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = uid
      and role in ('admin', 'sales', 'super_admin')
  );
$$;

-- 2. public.is_admin_or_sales() -- wrapper appele par les policies RLS
--    (run en tant qu'utilisateur authentifie, donc appelle la fonction
--    privee SECURITY DEFINER pour bypass la propre RLS de users).
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
      and role in ('admin', 'sales', 'super_admin')
  );
$$;

-- 3. public.is_admin() -- alias pour les policies admin-only (ex:
--    audit_log, signups admin). Inclut super_admin maintenant.
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
      and role in ('admin', 'super_admin')
  );
$$;

-- SECURITY DEFINER re-applique pour etre safe (cf. commentaire migration 0017
-- : CREATE OR REPLACE ne change pas le mode sur certaines versions PG).
alter function private.is_admin_or_sales(uuid) security definer;
alter function public.is_admin_or_sales() security definer;
alter function public.is_admin() security definer;

comment on function public.is_admin() is
  'P7.x.1.F-quater — true si auth.uid() a role admin OU super_admin. Utilise par les RLS admin-only.';
comment on function public.is_admin_or_sales() is
  'P7.x.1.F-quater — true si auth.uid() a role admin, sales OU super_admin. Utilise par les RLS admin+sales.';
