-- Migration 0058 — P5.x.1 : utilisateurs admin (soft archive + last_login + garde-fous super_admin)
--
-- Ajoute :
--   - archived_at TIMESTAMPTZ (soft delete préserve audit trail)
--   - last_login_at TIMESTAMPTZ (sync depuis auth.users.last_sign_in_at via trigger)
--   - 2 triggers garde-fous (defense in depth) :
--     * empêche d'archiver le dernier super_admin actif
--     * empêche de downgrader le rôle du dernier super_admin actif
--   - trigger de sync last_login_at depuis auth.users
--
-- Doctrine super_admin : ces garde-fous DB doublonnent les checks côté
-- server actions (lib/admin/users/actions.ts) pour éviter qu'un bug applicatif
-- ne permette de se priver de tout super_admin du système.

-- ============================================================================
-- 1. Soft delete
-- ============================================================================
alter table public.users
  add column if not exists archived_at timestamptz;

create index if not exists users_active_idx
  on public.users (created_at desc)
  where archived_at is null;

comment on column public.users.archived_at is
  'P5.x.1 — soft delete : NULL = actif, timestamp = archivé (préserve audit trail).';

-- ============================================================================
-- 2. last_login_at — synchronisé depuis auth.users.last_sign_in_at
-- ============================================================================
alter table public.users
  add column if not exists last_login_at timestamptz;

comment on column public.users.last_login_at is
  'P5.x.1 — copie de auth.users.last_sign_in_at, synchronisée via trigger.';

-- Fonction de sync (SECURITY DEFINER pour pouvoir écrire sur public.users
-- même si le contexte auth de l'update est anon/Supabase Auth).
create or replace function public.sync_user_last_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set last_login_at = new.last_sign_in_at
  where id = new.id;
  return new;
end;
$$;

-- Trigger sur auth.users : déclenché quand last_sign_in_at change.
drop trigger if exists sync_last_login_on_auth_users on auth.users;
create trigger sync_last_login_on_auth_users
  after update of last_sign_in_at on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.sync_user_last_login();

-- Backfill initial : lit auth.users une fois pour les lignes existantes.
update public.users u
set last_login_at = au.last_sign_in_at
from auth.users au
where au.id = u.id and u.last_login_at is null;

-- ============================================================================
-- 3. Garde-fou archive : impossible d'archiver le dernier super_admin actif
-- ============================================================================
create or replace function public.check_last_super_admin_archive()
returns trigger
language plpgsql
as $$
declare
  super_admin_count integer;
begin
  -- Détection : on archive (archived_at passe de NULL à NOT NULL) un super_admin.
  if new.archived_at is not null and old.archived_at is null and old.role = 'super_admin' then
    select count(*)
    into super_admin_count
    from public.users
    where role = 'super_admin'
      and archived_at is null
      and id <> old.id;

    if super_admin_count = 0 then
      raise exception 'Impossible d''archiver le dernier super_admin actif.'
        using errcode = 'P5x01';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_last_super_admin_archive_trigger on public.users;
create trigger check_last_super_admin_archive_trigger
  before update on public.users
  for each row
  execute function public.check_last_super_admin_archive();

-- ============================================================================
-- 4. Garde-fou downgrade : impossible de downgrader le dernier super_admin
-- ============================================================================
create or replace function public.check_last_super_admin_downgrade()
returns trigger
language plpgsql
as $$
declare
  super_admin_count integer;
begin
  if old.role = 'super_admin' and new.role <> 'super_admin' then
    select count(*)
    into super_admin_count
    from public.users
    where role = 'super_admin'
      and archived_at is null
      and id <> old.id;

    if super_admin_count = 0 then
      raise exception 'Impossible de downgrader le dernier super_admin actif.'
        using errcode = 'P5x02';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_last_super_admin_downgrade_trigger on public.users;
create trigger check_last_super_admin_downgrade_trigger
  before update of role on public.users
  for each row
  execute function public.check_last_super_admin_downgrade();
