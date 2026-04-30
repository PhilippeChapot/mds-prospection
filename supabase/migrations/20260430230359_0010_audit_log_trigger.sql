-- Migration 0010 — audit_log + trigger generique
-- INSERT/UPDATE/DELETE sur prospects, companies, app_settings sont audites.

-- ========================================================================== --
-- audit_log (SPEC §3.16.1)
-- ========================================================================== --
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  action public.audit_action not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_user_idx on public.audit_log (user_id, created_at desc) where user_id is not null;

comment on table public.audit_log is 'Tracabilite admin (SPEC §3.16.1)';

-- ========================================================================== --
-- Fonction generique fn_audit_log() — securite definer dans schema public
-- mais sans aucun acces DML autre que celui de la table audit_log.
-- Capture auth.uid() depuis le JWT du Data API.
-- ========================================================================== --
create function public.fn_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_action public.audit_action;
  v_entity_id uuid;
  v_before jsonb := null;
  v_after jsonb := null;
begin
  -- Recupere l'id utilisateur courant si disponible (auth.uid() retourne null
  -- pour les operations service-role ou non authentifiees).
  begin
    v_user_id := auth.uid();
  exception when others then
    v_user_id := null;
  end;

  if (TG_OP = 'INSERT') then
    v_action := 'create';
    v_after := to_jsonb(NEW);
    v_entity_id := (NEW).id;
  elsif (TG_OP = 'UPDATE') then
    v_action := 'update';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_entity_id := (NEW).id;
  elsif (TG_OP = 'DELETE') then
    v_action := 'delete';
    v_before := to_jsonb(OLD);
    v_entity_id := (OLD).id;
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, before, after)
  values (v_user_id, v_action, TG_TABLE_NAME, v_entity_id, v_before, v_after);

  if (TG_OP = 'DELETE') then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- ========================================================================== --
-- Cas particulier : app_settings utilise `key` comme PK (text, pas uuid)
-- → on ne stocke pas entity_id pour cette table. Trigger dedie.
-- ========================================================================== --
create function public.fn_audit_log_app_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_action public.audit_action;
  v_before jsonb := null;
  v_after jsonb := null;
  v_key text;
begin
  begin
    v_user_id := auth.uid();
  exception when others then
    v_user_id := null;
  end;

  if (TG_OP = 'INSERT') then
    v_action := 'create';
    v_after := to_jsonb(NEW);
    v_key := (NEW).key;
  elsif (TG_OP = 'UPDATE') then
    v_action := 'update';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_key := (NEW).key;
  elsif (TG_OP = 'DELETE') then
    v_action := 'delete';
    v_before := to_jsonb(OLD);
    v_key := (OLD).key;
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, before, after)
  values (
    v_user_id,
    v_action,
    'app_settings',
    null,
    coalesce(v_before, '{}'::jsonb) || jsonb_build_object('_app_setting_key', v_key),
    coalesce(v_after, '{}'::jsonb) || jsonb_build_object('_app_setting_key', v_key)
  );

  if (TG_OP = 'DELETE') then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- ========================================================================== --
-- Triggers
-- ========================================================================== --
create trigger trg_audit_prospects
  after insert or update or delete on public.prospects
  for each row execute function public.fn_audit_log();

create trigger trg_audit_companies
  after insert or update or delete on public.companies
  for each row execute function public.fn_audit_log();

create trigger trg_audit_app_settings
  after insert or update or delete on public.app_settings
  for each row execute function public.fn_audit_log_app_settings();
