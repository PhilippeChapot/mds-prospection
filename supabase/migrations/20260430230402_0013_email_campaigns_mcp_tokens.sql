-- Migration 0013 — email_campaigns + mcp_tokens

-- ========================================================================== --
-- email_campaigns : mass email depuis l'admin (SPEC §3.29)
-- ========================================================================== --
create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  name text not null,
  subject_fr text,
  subject_en text,
  body_fr text,
  body_en text,
  attachments_urls text[] not null default '{}',
  target_filter jsonb not null default '{}'::jsonb,
  recipient_count int not null default 0,
  brevo_campaign_id text,
  status public.campaign_status not null default 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  open_count int not null default 0,
  click_count int not null default 0,
  unsubscribe_count int not null default 0,
  bounce_count int not null default 0,
  created_at timestamptz not null default now()
);

create index email_campaigns_status_idx on public.email_campaigns (status, scheduled_at);
create index email_campaigns_creator_idx on public.email_campaigns (created_by_user_id, created_at desc);

comment on table public.email_campaigns is 'Mass email depuis /admin/campaigns (SPEC §3.29)';

-- ========================================================================== --
-- mcp_tokens : access tokens pour le MCP server read-only (SPEC §3.23)
-- ========================================================================== --
create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  token_hash text not null,
  prefix text not null,
  scopes text[] not null default array['mcp:read'],
  expires_at timestamptz,
  last_used_at timestamptz,
  last_used_ip inet,
  call_count int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index mcp_tokens_user_idx on public.mcp_tokens (user_id) where revoked_at is null;
create index mcp_tokens_prefix_idx on public.mcp_tokens (prefix);

comment on table public.mcp_tokens is 'Tokens d''acces au MCP server (auth Bearer pour Cowork — SPEC §3.23)';
