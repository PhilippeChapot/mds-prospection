-- Migration 0065 — P9.2 : messagerie interne asynchrone.
--
-- Decision Cowork 2026-05-27 : PAS de temps reel (Supabase Realtime
-- abandonne). Juste une messagerie asynchrone type boite mail interne,
-- avec notification email Resend a chaque message/reponse.
--
-- Modele :
--   - `staff_dm`   : DM prive entre 2 membres du staff (super_admin/
--                    admin/sales). Visible uniquement par les 2.
--   - `support`    : conversation entre un exposant (contact) et le
--                    staff. Inbox partagee staff (tout le staff voit
--                    + peut repondre via participant pseudo 'staff_pool').
--                    L'exposant ne voit que ses propres conversations.
--
-- V1 limites :
--   - Affilies pas couverts V1 (ils peuvent toujours emailer philippe@).
--     Le polymorphisme `participant_type` accepte deja 'contact' donc
--     une extension V2 vers affilies sera additive (pas de breaking).
--
-- Polymorphisme : les participants peuvent etre `user` (staff), `contact`
-- (exposant), ou `staff_pool` (sentinelle "tous les staff"). L'enforcement
-- RLS est fait via :
--   - staff : public.is_admin_or_sales() voit TOUT (simple).
--   - contact : pas de RLS contact direct (auth contact = JWT cookie via
--     espace-exposant, pas JWT Supabase auth). Les server actions
--     /mon-espace utilisent getSupabaseServiceClient() + check applicatif
--     que le contact connecte est bien participant.

-- ----------------------------------------------------------------------------
-- 1. internal_conversations
-- ----------------------------------------------------------------------------

create table if not exists public.internal_conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('staff_dm', 'support')),
  subject text,
  created_by_type text not null check (created_by_type in ('user', 'contact')),
  created_by_id uuid not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists internal_conversations_last_msg_idx
  on public.internal_conversations (last_message_at desc);
create index if not exists internal_conversations_type_idx
  on public.internal_conversations (type)
  where archived_at is null;

comment on table public.internal_conversations is
  'P9.2 — conversations internes (staff_dm = staff↔staff, support = staff↔exposant via staff_pool).';

-- ----------------------------------------------------------------------------
-- 2. conversation_participants (polymorphe)
-- ----------------------------------------------------------------------------

create table if not exists public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.internal_conversations(id) on delete cascade,
  participant_type text not null check (participant_type in ('user', 'contact', 'staff_pool')),
  -- NULL si staff_pool (pseudo-participant = inbox partagee tout le staff).
  participant_id uuid,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  -- Une conversation ne peut pas avoir le meme participant deux fois.
  -- staff_pool : participant_id NULL → unique sur (conv_id, type, NULL).
  -- En PG les NULL sont distincts par defaut donc on contraint avec un
  -- index partiel pour staff_pool, et l'index principal pour les autres.
  unique (conversation_id, participant_type, participant_id)
);

create unique index if not exists conv_participants_staff_pool_unique
  on public.conversation_participants (conversation_id)
  where participant_type = 'staff_pool';

create index if not exists conversation_participants_conv_idx
  on public.conversation_participants (conversation_id);
create index if not exists conversation_participants_lookup_idx
  on public.conversation_participants (participant_type, participant_id);

comment on table public.conversation_participants is
  'P9.2 — participants polymorphes (user/contact/staff_pool). last_read_at sert au badge non-lus.';

-- ----------------------------------------------------------------------------
-- 3. internal_messages
-- ----------------------------------------------------------------------------

create table if not exists public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.internal_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('user', 'contact')),
  sender_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists internal_messages_conv_idx
  on public.internal_messages (conversation_id, created_at);

comment on table public.internal_messages is
  'P9.2 — messages dans une conversation (thread).';

-- ----------------------------------------------------------------------------
-- 4. Trigger : bump last_message_at sur INSERT message
-- ----------------------------------------------------------------------------

create or replace function public.bump_conversation_last_message()
returns trigger
language plpgsql
as $$
begin
  update public.internal_conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists bump_conversation_last_message_trigger on public.internal_messages;
create trigger bump_conversation_last_message_trigger
  after insert on public.internal_messages
  for each row execute function public.bump_conversation_last_message();

-- ----------------------------------------------------------------------------
-- 5. RLS — staff voit tout (admin/sales/super_admin)
--    Pas de RLS contact (auth via JWT cookie espace-exposant, pas Supabase
--    auth) ; les server actions /mon-espace passent par service-client +
--    check applicatif que le contact connecte est bien participant.
-- ----------------------------------------------------------------------------

alter table public.internal_conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.internal_messages enable row level security;

drop policy if exists "internal_conv_staff_all" on public.internal_conversations;
create policy "internal_conv_staff_all" on public.internal_conversations
  for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

drop policy if exists "conv_participants_staff_all" on public.conversation_participants;
create policy "conv_participants_staff_all" on public.conversation_participants
  for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

drop policy if exists "internal_msg_staff_all" on public.internal_messages;
create policy "internal_msg_staff_all" on public.internal_messages
  for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());
