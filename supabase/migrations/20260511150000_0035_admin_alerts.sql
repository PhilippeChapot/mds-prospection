-- Migration 0035 — P5.x.11
-- Cache des alertes admin calculees par le cron /api/cron/admin-alerts.
--
-- Une alerte = une condition metier qui necessite l'attention de l'admin
-- (devis emis non signe depuis 7j, payment-link non paye depuis 14j, stand
-- non attribue a T-30j, etc.). Le cron tourne toutes les heures :
--   - UPSERT les alertes actives qui matchent (dedup sur kind+prospect_id
--     OU kind+signup_id avec resolved_at IS NULL)
--   - Auto-resolve les alertes existantes qui ne matchent plus
--     (ex: un devis signe entre temps -> "devis_unsigned" auto-resolu)
--
-- Index unresolved : query principale de la carte AlertsCard du dashboard.
-- Index par prospect : permet de drill-down depuis la fiche prospect.
--
-- Pas d'email_logs en V1.1 (alerte "prospect sans contact admin" reportee
-- a V1.2 quand on aura un logging email systematique cote admin notifier).

create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  severity text not null check (severity in ('warning', 'critical')),
  prospect_id uuid references public.prospects(id) on delete cascade,
  signup_id uuid references public.public_signup_attempts(id) on delete cascade,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null
);

create index if not exists admin_alerts_unresolved_idx
  on public.admin_alerts (severity, created_at desc)
  where resolved_at is null;

create index if not exists admin_alerts_prospect_idx
  on public.admin_alerts (prospect_id)
  where resolved_at is null and prospect_id is not null;

create index if not exists admin_alerts_signup_idx
  on public.admin_alerts (signup_id)
  where resolved_at is null and signup_id is not null;

-- Dedup index : empeche 2 alertes actives du meme kind sur le meme
-- prospect/signup. Le cron UPSERT s'appuie sur cette contrainte via
-- ON CONFLICT.
create unique index if not exists admin_alerts_unique_active_prospect
  on public.admin_alerts (kind, prospect_id)
  where resolved_at is null and prospect_id is not null;

create unique index if not exists admin_alerts_unique_active_signup
  on public.admin_alerts (kind, signup_id)
  where resolved_at is null and signup_id is not null;

comment on table public.admin_alerts is
  'P5.x.11 — Cache des alertes pipeline admin, calcule horaire par cron admin-alerts.';
comment on column public.admin_alerts.kind is
  'Type d''alerte (ex: devis_unsigned_7d, devis_unsigned_14d, pl_unpaid_14d, verified_unconverted_21d, booth_unassigned_t30, vat_eu_unverified_5k).';
comment on column public.admin_alerts.details is
  'Snapshot JSONB des valeurs au moment du calcul (ex: { age_days: 12, devis_number: "D-..." }). Sert au tooltip UI.';
