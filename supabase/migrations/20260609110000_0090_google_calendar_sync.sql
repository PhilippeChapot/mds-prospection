-- Migration 0090 — P14.2.SalesCalendarGoogleSync
--
-- Synchronisation bidirectionnelle calendrier MDS ↔ Google Calendar + Meet.
--
-- 2 volets :
--   1. Table calendar_oauth_tokens : 1 ligne par user connecté à Google.
--      Stocke le refresh_token CHIFFRÉ (AES-256-GCM via
--      CALENDAR_OAUTH_ENCRYPTION_KEY — jamais en clair en DB), le calendrier
--      cible, l'état du webhook push channel, le sync_token incrémental.
--   2. Colonnes de sync sur calendar_events : etag Google (détection de
--      conflit), sync_status (machine à états push/pull), meet_url +
--      meet_conference_id (lien visio auto-généré).
--
-- Les colonnes google_calendar_event_id + google_calendar_synced_at
-- existent déjà (migration 0082, prépa). On les réutilise.
--
-- Doctrine [[feedback_rls_systematic]] + [[reference_supabase_data_api_grants]] :
-- RLS service_role only (les server actions + crons utilisent le service
-- client ; aucun accès anon/authenticated direct).

-- ─── Table calendar_oauth_tokens ───────────────────────────────────────
create table if not exists public.calendar_oauth_tokens (
  -- 1 connexion Google par user MDS (PK = user_id).
  user_id                     uuid primary key references public.users(id) on delete cascade,

  provider                    text not null default 'google'
                                check (provider in ('google')),

  -- Refresh token CHIFFRÉ AES-256-GCM. Format applicatif :
  -- "<iv_hex>:<authTag_hex>:<ciphertext_hex>" (cf. lib/.../encryption.ts).
  -- JAMAIS stocké en clair.
  encrypted_refresh_token     text not null,

  -- Email du compte Google connecté (affichage UI + debug).
  google_account_email        text,

  -- Calendrier cible pour le PUSH (default 'primary'). L'user peut en
  -- choisir un autre via le dropdown settings.
  google_calendar_id          text not null default 'primary',

  -- Switch sync globale (push + pull). L'user peut couper sans déconnecter.
  sync_enabled                boolean not null default true,

  -- Webhook push channel (Google watch()). Renouvelé par cron (expiration
  -- max ~7j côté Google). channel_id = UUID qu'on génère ; resource_id =
  -- identifiant ressource renvoyé par Google ; token = secret de validation
  -- du header X-Goog-Channel-Token.
  webhook_channel_id          text,
  webhook_resource_id         text,
  webhook_token               text,
  webhook_expires_at          timestamptz,

  -- Sync incrémental PULL : nextSyncToken renvoyé par events.list.
  sync_token                  text,
  last_synced_at              timestamptz,

  -- Dernière erreur de sync (affichage statut UI).
  last_sync_error             text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_calendar_oauth_tokens_channel
  on public.calendar_oauth_tokens(webhook_channel_id)
  where webhook_channel_id is not null;

create index if not exists idx_calendar_oauth_tokens_webhook_renewal
  on public.calendar_oauth_tokens(webhook_expires_at)
  where sync_enabled = true;

comment on table public.calendar_oauth_tokens is
  'P14.2.SalesCalendarGoogleSync — tokens OAuth Google par user (refresh chiffré AES-256-GCM). 1 ligne = 1 connexion. webhook_* = push channel renouvelé par cron.';
comment on column public.calendar_oauth_tokens.encrypted_refresh_token is
  'Refresh token Google chiffré AES-256-GCM (format iv:authTag:ciphertext hex). Jamais en clair.';
comment on column public.calendar_oauth_tokens.webhook_token is
  'Secret de validation du header X-Goog-Channel-Token reçu sur le webhook PULL.';

-- ─── RLS service_role only ──────────────────────────────────────────────
alter table public.calendar_oauth_tokens enable row level security;

drop policy if exists "service_role_all_calendar_oauth_tokens" on public.calendar_oauth_tokens;
create policy "service_role_all_calendar_oauth_tokens"
  on public.calendar_oauth_tokens
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.calendar_oauth_tokens to service_role;

-- ─── Colonnes de sync sur calendar_events ──────────────────────────────
-- etag Google : permet de détecter qu'un event a changé côté Google sans
-- re-puller tout (If-None-Match) + d'éviter une boucle push↔pull.
alter table public.calendar_events
  add column if not exists google_etag text;

-- Machine à états sync (text + CHECK, extensible sans migration enum).
--   NULL          = jamais lié à Google.
--   'synced'      = aligné avec Google.
--   'pending_push'= modif MDS à pousser (push initial échoué → cron retry).
--   'pending_delete' = suppression MDS à propager côté Google.
--   'error'       = échec persistant (affichage UI + alerte).
alter table public.calendar_events
  add column if not exists sync_status text
    check (sync_status is null or sync_status in (
      'synced', 'pending_push', 'pending_delete', 'error'
    ));

-- Google Meet auto-généré (Phase 8).
alter table public.calendar_events
  add column if not exists meet_url text;
alter table public.calendar_events
  add column if not exists meet_conference_id text;

-- Index pour le cron retry PUSH : events restés en pending_*.
create index if not exists idx_calendar_events_sync_pending
  on public.calendar_events(updated_at)
  where sync_status in ('pending_push', 'pending_delete', 'error');

-- Index pour la réconciliation PULL : lookup rapide par google event id.
create index if not exists idx_calendar_events_google_event_id
  on public.calendar_events(google_calendar_event_id)
  where google_calendar_event_id is not null;

comment on column public.calendar_events.google_etag is
  'P14.2 — etag Google du dernier sync (détection conflit + anti-boucle push/pull).';
comment on column public.calendar_events.sync_status is
  'P14.2 — état sync : NULL=non lié, synced, pending_push, pending_delete, error.';
comment on column public.calendar_events.meet_url is
  'P14.2 — lien Google Meet (hangoutLink) auto-généré si demandé à la création.';
