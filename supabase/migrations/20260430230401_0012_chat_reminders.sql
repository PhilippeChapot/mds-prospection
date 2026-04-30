-- Migration 0012 — chat_conversations + chat_messages + reminders (SPEC §3.22)

-- ========================================================================== --
-- chat_conversations
-- ========================================================================== --
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                          -- FK polymorphe : users.id ou contacts.id selon user_type
  user_type public.chat_user_type not null,
  title text,
  message_count int not null default 0,
  total_tokens_used int not null default 0,
  estimated_cost_eur numeric(10,4) not null default 0,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  archived boolean not null default false
);

create index chat_conversations_user_idx on public.chat_conversations (user_type, user_id, last_message_at desc);
create index chat_conversations_active_idx on public.chat_conversations (last_message_at desc) where archived = false;

comment on table public.chat_conversations is 'Sessions chat IA admin/sales/partner (SPEC §3.22)';

-- ========================================================================== --
-- chat_messages
-- ========================================================================== --
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  role public.chat_role not null,
  content jsonb not null,
  model_used text,
  tokens_input int not null default 0,
  tokens_output int not null default 0,
  created_at timestamptz not null default now()
);

create index chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at);

comment on table public.chat_messages is 'Messages individuels (incl. tool_use et tool_result Anthropic)';

-- ========================================================================== --
-- reminders : rappels manuels ou crees par l'assistant IA
-- ========================================================================== --
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  title text not null,
  body text,
  due_at timestamptz not null,
  reminded_at timestamptz,
  completed_at timestamptz,
  type public.reminder_type not null default 'follow_up',
  source public.reminder_source not null default 'manual',
  created_at timestamptz not null default now()
);

create index reminders_user_due_idx on public.reminders (user_id, due_at) where completed_at is null;
create index reminders_prospect_idx on public.reminders (prospect_id) where prospect_id is not null;
-- Cron quotidien 8h UTC scan les rappels echus du jour.
create index reminders_due_today_idx on public.reminders (due_at) where completed_at is null and reminded_at is null;

comment on table public.reminders is 'Rappels (cron quotidien envoie les notifs des rappels echus)';
