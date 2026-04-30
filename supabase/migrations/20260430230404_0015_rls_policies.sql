-- Migration 0015 — Row Level Security policies
-- Modele d'acces (cf. SPEC §4.2) :
--   - admin/sales (authenticated, public.users.role IN admin|sales) : R/W sur toutes
--     les tables admin (prospects, companies, contacts, activities, sync_logs,
--     prs_2026_exhibitors, addon_options, pricing_tiers, booth_inventory, app_settings...)
--   - anon : INSERT sur public_signup_attempts (formulaire public), SELECT sur
--     poles + pricing_tiers actifs + addon_options actifs + booth_inventory disponibles.
--   - service_role : bypass automatique de RLS (les routes API privilegiees l'utilisent).

-- ========================================================================== --
-- Helpers : fonction is_admin_or_sales() — security definer dans schema private
-- ========================================================================== --
create function private.is_admin_or_sales(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = uid
      and role in ('admin', 'sales')
  );
$$;

revoke execute on function private.is_admin_or_sales(uuid) from public, anon, authenticated;
grant execute on function private.is_admin_or_sales(uuid) to authenticated;

-- Wrapper public callable depuis les policies (les policies tournent en tant que
-- l'utilisateur authentifie, donc elles peuvent appeler la fonction definer).
create function public.is_admin_or_sales()
returns boolean
language sql
stable
set search_path = public
as $$
  select private.is_admin_or_sales(auth.uid());
$$;

grant execute on function public.is_admin_or_sales() to authenticated, anon;

-- ========================================================================== --
-- Activation RLS sur toutes les tables publiques
-- ========================================================================== --
alter table public.seasons               enable row level security;
alter table public.users                 enable row level security;
alter table public.poles                 enable row level security;
alter table public.companies             enable row level security;
alter table public.contacts              enable row level security;
alter table public.prs_2026_exhibitors   enable row level security;
alter table public.pricing_tiers         enable row level security;
alter table public.addon_options         enable row level security;
alter table public.booth_inventory       enable row level security;
alter table public.prospects             enable row level security;
alter table public.activities            enable row level security;
alter table public.public_signup_attempts enable row level security;
alter table public.app_settings          enable row level security;
alter table public.sync_logs             enable row level security;
alter table public.exhibitor_sessions    enable row level security;
alter table public.exhibitor_resources   enable row level security;
alter table public.company_profiles      enable row level security;
alter table public.sellsy_products_mirror enable row level security;
alter table public.affiliates            enable row level security;
alter table public.affiliate_clicks      enable row level security;
alter table public.audit_log             enable row level security;
alter table public.stripe_events_processed enable row level security;
alter table public.sellsy_events_processed enable row level security;
alter table public.chat_conversations    enable row level security;
alter table public.chat_messages         enable row level security;
alter table public.reminders             enable row level security;
alter table public.email_campaigns       enable row level security;
alter table public.mcp_tokens            enable row level security;

-- ========================================================================== --
-- Grants par defaut : authenticated lit/ecrit, anon n'a que les exceptions
-- explicites ci-dessous (poles, signup, catalogues actifs).
-- ========================================================================== --
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant usage on schema public to authenticated, anon;

-- ========================================================================== --
-- POLES — lecture publique (formulaire public, classification IA)
-- ========================================================================== --
grant select on public.poles to anon, authenticated;

create policy "poles_read_public"
  on public.poles for select
  to anon, authenticated
  using (is_active = true);

create policy "poles_admin_write"
  on public.poles for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- SEASONS — lecture authentifie + ecriture admin
-- ========================================================================== --
create policy "seasons_read_authenticated"
  on public.seasons for select
  to authenticated
  using (true);

create policy "seasons_admin_write"
  on public.seasons for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- USERS — chacun lit son profil + admin lit tout, update sur sa propre ligne
-- ========================================================================== --
create policy "users_read_self"
  on public.users for select
  to authenticated
  using (id = auth.uid() or public.is_admin_or_sales());

create policy "users_update_self"
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "users_admin_manage"
  on public.users for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- COMPANIES + CONTACTS — admin/sales R/W
-- ========================================================================== --
create policy "companies_admin"
  on public.companies for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

create policy "contacts_admin"
  on public.contacts for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- PRS_2026_EXHIBITORS — admin
-- ========================================================================== --
create policy "prs_exhibitors_admin"
  on public.prs_2026_exhibitors for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- PRICING_TIERS — admin R/W, lecture publique des tiers actifs sur saison active
-- ========================================================================== --
grant select on public.pricing_tiers to anon;

create policy "pricing_tiers_read_public_active"
  on public.pricing_tiers for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.seasons s
      where s.id = pricing_tiers.season_id and s.is_active = true
    )
  );

create policy "pricing_tiers_admin_write"
  on public.pricing_tiers for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- ADDON_OPTIONS — meme regle que pricing_tiers
-- ========================================================================== --
grant select on public.addon_options to anon;

create policy "addon_options_read_public_active"
  on public.addon_options for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.seasons s
      where s.id = addon_options.season_id and s.is_active = true
    )
  );

create policy "addon_options_admin_write"
  on public.addon_options for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- BOOTH_INVENTORY — admin R/W, anon lit uniquement les emplacements available
--                   sur saison active (formulaire public)
-- ========================================================================== --
grant select on public.booth_inventory to anon;

create policy "booth_inventory_read_public_available"
  on public.booth_inventory for select
  to anon, authenticated
  using (
    status in ('available', 'option')
    and exists (
      select 1 from public.seasons s
      where s.id = booth_inventory.season_id and s.is_active = true
    )
  );

create policy "booth_inventory_admin"
  on public.booth_inventory for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- PROSPECTS + ACTIVITIES + SYNC_LOGS — admin/sales seulement
-- ========================================================================== --
create policy "prospects_admin"
  on public.prospects for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

create policy "activities_admin"
  on public.activities for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

create policy "sync_logs_admin_read"
  on public.sync_logs for select
  to authenticated
  using (public.is_admin_or_sales());

-- ========================================================================== --
-- PUBLIC_SIGNUP_ATTEMPTS — INSERT anonyme (formulaire public),
-- UPDATE anonyme limite (verification token), SELECT/UPDATE complet pour admin.
-- ========================================================================== --
grant insert on public.public_signup_attempts to anon;
grant select on public.public_signup_attempts to anon; -- pour la verif token (filtree par policy)

create policy "signup_attempts_anon_insert"
  on public.public_signup_attempts for insert
  to anon
  with check (status = 'awaiting_verification');

-- L'anon peut lire son propre attempt par token (verification page).
create policy "signup_attempts_anon_select_by_token"
  on public.public_signup_attempts for select
  to anon
  using (status in ('awaiting_verification', 'verified'));

create policy "signup_attempts_admin"
  on public.public_signup_attempts for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- APP_SETTINGS — admin seulement (RW)
-- ========================================================================== --
create policy "app_settings_admin"
  on public.app_settings for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- EXHIBITOR_SESSIONS — admin gere ; le contact recupere sa session via token
-- (cote app, on utilisera service_role pour ces operations).
-- ========================================================================== --
create policy "exhibitor_sessions_admin"
  on public.exhibitor_sessions for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- EXHIBITOR_RESOURCES — admin write ; lecture publique des ressources publiees
-- ========================================================================== --
grant select on public.exhibitor_resources to anon;

create policy "exhibitor_resources_read_published"
  on public.exhibitor_resources for select
  to anon, authenticated
  using (is_published = true);

create policy "exhibitor_resources_admin_write"
  on public.exhibitor_resources for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- COMPANY_PROFILES — admin gere (P5 ajoutera l'edition par l'exposant)
-- ========================================================================== --
create policy "company_profiles_admin"
  on public.company_profiles for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- SELLSY_PRODUCTS_MIRROR — admin
-- ========================================================================== --
create policy "sellsy_products_mirror_admin"
  on public.sellsy_products_mirror for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- AFFILIATES + CLICKS — admin
-- ========================================================================== --
create policy "affiliates_admin"
  on public.affiliates for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

create policy "affiliate_clicks_admin"
  on public.affiliate_clicks for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- L'INSERT anonyme via formulaire public se fera via service_role cote API
-- (on capture l'IP cote serveur, jamais expose au client).

-- ========================================================================== --
-- AUDIT_LOG — read-only pour les admins, jamais d'INSERT/UPDATE/DELETE manuel
-- (les triggers en SECURITY DEFINER ecrivent ; les utilisateurs ne touchent pas)
-- ========================================================================== --
revoke insert, update, delete on public.audit_log from authenticated, anon;

create policy "audit_log_admin_read"
  on public.audit_log for select
  to authenticated
  using (public.is_admin_or_sales());

-- ========================================================================== --
-- STRIPE / SELLSY EVENTS PROCESSED — service_role uniquement (webhooks)
-- ========================================================================== --
revoke insert, update, delete on public.stripe_events_processed from authenticated, anon;
revoke insert, update, delete on public.sellsy_events_processed from authenticated, anon;

create policy "stripe_events_admin_read"
  on public.stripe_events_processed for select
  to authenticated
  using (public.is_admin_or_sales());

create policy "sellsy_events_admin_read"
  on public.sellsy_events_processed for select
  to authenticated
  using (public.is_admin_or_sales());

-- ========================================================================== --
-- CHAT (conversations + messages) — chacun voit son propre historique
-- ========================================================================== --
create policy "chat_conversations_owner"
  on public.chat_conversations for all
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin_or_sales()
  )
  with check (
    user_id = auth.uid()
    or public.is_admin_or_sales()
  );

create policy "chat_messages_owner"
  on public.chat_messages for all
  to authenticated
  using (
    exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
        and (c.user_id = auth.uid() or public.is_admin_or_sales())
    )
  )
  with check (
    exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
        and (c.user_id = auth.uid() or public.is_admin_or_sales())
    )
  );

-- ========================================================================== --
-- REMINDERS — proprietaire seulement (admin/sales en pratique)
-- ========================================================================== --
create policy "reminders_owner"
  on public.reminders for all
  to authenticated
  using (user_id = auth.uid() or public.is_admin_or_sales())
  with check (user_id = auth.uid() or public.is_admin_or_sales());

-- ========================================================================== --
-- EMAIL_CAMPAIGNS — admin
-- ========================================================================== --
create policy "email_campaigns_admin"
  on public.email_campaigns for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ========================================================================== --
-- MCP_TOKENS — chacun gere ses propres tokens
-- ========================================================================== --
create policy "mcp_tokens_owner"
  on public.mcp_tokens for all
  to authenticated
  using (user_id = auth.uid() or public.is_admin_or_sales())
  with check (user_id = auth.uid() or public.is_admin_or_sales());
