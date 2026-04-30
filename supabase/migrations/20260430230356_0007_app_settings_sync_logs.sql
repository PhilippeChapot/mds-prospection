-- Migration 0007 — app_settings + sync_logs

-- ========================================================================== --
-- app_settings : key/value config dynamique (cf. SPEC §3.12)
-- ========================================================================== --
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  category public.app_setting_category not null default 'general',
  updated_by_user_id uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is 'Reglages admin editables depuis /admin/preferences';

-- ========================================================================== --
-- sync_logs : tracabilite des syncs API (Sellsy, Brevo, Connectonair)
-- ========================================================================== --
create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  target public.sync_target not null,
  operation public.sync_op not null,
  status public.sync_status not null,
  error_message text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index sync_logs_entity_idx on public.sync_logs (entity_type, entity_id, created_at desc);
create index sync_logs_target_status_idx on public.sync_logs (target, status, created_at desc);

comment on table public.sync_logs is 'Trace de chaque appel API tiers (debug + retry)';
