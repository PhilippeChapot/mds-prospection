-- Migration 0063 — P9.1-natif : messagerie visiteur native.
--
-- Pivot de P9.1 (Tawk.to) : on remplace l'integration externe par une
-- messagerie 100% native (cf. brief P9.1-natif). Le visiteur ecrit via
-- un widget sur les pages publiques -> message stocke en DB +
-- lead prospect cree + notif email a l'admin. L'admin repond depuis
-- /admin/messages -> email Resend au visiteur (reply-to philippe@).
--
--   - table visitor_messages          (message initial du visiteur)
--   - table visitor_message_replies   (reponses staff, thread)
--   - RLS : SELECT + ALL pour admin/sales/super_admin
--           (l'insert visiteur passe par service-role cote server action)
--   - seed app_setting visitor_chat_enabled = true
--   - cleanup : suppression des 4 settings Tawk.to obsoletes
--     (chat_widget_enabled, tawk_property_id, tawk_widget_id,
--     tawk_webhook_secret) si presents en prod.

-- ----------------------------------------------------------------------------
-- 1. Table visitor_messages
-- ----------------------------------------------------------------------------

create table if not exists public.visitor_messages (
  id uuid primary key default gen_random_uuid(),
  visitor_name text not null,
  visitor_email text not null,
  visitor_phone text,
  message text not null,
  page_url text,
  locale text not null default 'fr' check (locale in ('fr', 'en')),

  -- Lien CRM
  prospect_id uuid references public.prospects(id) on delete set null,

  -- Workflow
  status text not null default 'new'
    check (status in ('new', 'read', 'replied', 'archived')),
  assigned_to_user_id uuid references public.users(id) on delete set null,

  -- Metadata (anti-spam, debug)
  ip_address inet,
  user_agent text,

  created_at timestamptz not null default now(),
  read_at timestamptz,
  replied_at timestamptz
);

create index if not exists visitor_messages_status_idx
  on public.visitor_messages (status, created_at desc);
create index if not exists visitor_messages_prospect_idx
  on public.visitor_messages (prospect_id)
  where prospect_id is not null;
create index if not exists visitor_messages_ip_recent_idx
  on public.visitor_messages (ip_address, created_at desc)
  where ip_address is not null;

comment on table public.visitor_messages is
  'P9.1-natif — messages laisses par les visiteurs via le widget public. Chaque message peut etre lie a un prospect lead (source=chat_visiteur).';

-- ----------------------------------------------------------------------------
-- 2. Table visitor_message_replies
-- ----------------------------------------------------------------------------

create table if not exists public.visitor_message_replies (
  id uuid primary key default gen_random_uuid(),
  visitor_message_id uuid not null
    references public.visitor_messages(id) on delete cascade,
  sender_user_id uuid not null references public.users(id),
  reply_text text not null,
  email_sent_at timestamptz,
  email_resend_id text,
  created_at timestamptz not null default now()
);

create index if not exists visitor_message_replies_message_idx
  on public.visitor_message_replies (visitor_message_id, created_at);

comment on table public.visitor_message_replies is
  'P9.1-natif — reponses staff envoyees par email au visiteur (via Resend, reply-to philippe@). 1 thread = 1 visitor_message + N replies.';

-- ----------------------------------------------------------------------------
-- 3. RLS — admin/sales/super_admin lecture + ecriture
--    L'insert visiteur (anon) passe par getSupabaseServiceClient() cote
--    server action submitVisitorMessageAction (bypass RLS) ; pas besoin
--    de policy anon ici.
-- ----------------------------------------------------------------------------

alter table public.visitor_messages enable row level security;
alter table public.visitor_message_replies enable row level security;

drop policy if exists "visitor_messages_admin_all" on public.visitor_messages;
create policy "visitor_messages_admin_all" on public.visitor_messages
  for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

drop policy if exists "visitor_message_replies_admin_all" on public.visitor_message_replies;
create policy "visitor_message_replies_admin_all" on public.visitor_message_replies
  for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ----------------------------------------------------------------------------
-- 4. Seed app_settings
-- ----------------------------------------------------------------------------

insert into public.app_settings (key, value, description, category, updated_at) values
  ('visitor_chat_enabled',
   'true'::jsonb,
   'Toggle du widget de messagerie visiteur sur les pages publiques. Désactivé = bouton flottant masqué partout.',
   'integrations',
   now())
on conflict (key) do nothing;

-- Cleanup : retire les 4 settings Tawk.to obsoletes (pivot P9.1-natif).
-- Inoffensif si elles n'existent pas (DELETE WHERE ne fait rien).
delete from public.app_settings
where key in (
  'chat_widget_enabled',
  'tawk_property_id',
  'tawk_widget_id',
  'tawk_webhook_secret'
);
