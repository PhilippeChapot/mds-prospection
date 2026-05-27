-- Migration 0067 — P8.3 : Admin Emailing Center.
--
-- La table email_campaigns existe deja (legacy P5 avec body_fr/body_en
-- + campaign_status enum). On l'etend pour P8.3 avec :
--   - category : lien P8.1 categorie pref pour filtrage RGPD.
--   - audience_key + audience_filters : audience prédefinie + filtres.
--   - content_mode : inline / template.
--   - brevo_template_id : si content_mode='template'.
--   - sent_count / error_count : stats simples V1.
--   - sent_by_user_id : qui a appuye sur le bouton "Envoyer".
--   - test_email_sent_at : flag obligatoire (no test, no send).
--
-- + Table `campaign_recipients` (log d'envoi par contact, incluant les
--   skipped avec skip_reason pour traçabilité RGPD).
-- + Ajout 'error' a l'enum campaign_status (legacy a 'archived' mais
--   pas 'error', le brief le demande pour status='error').

-- 1. Etendre l'enum campaign_status avec 'error'.
alter type public.campaign_status add value if not exists 'error';

-- 2. Etendre email_campaigns.
alter table public.email_campaigns
  add column if not exists category text
    check (category in (
      'general','exposant','facturation','kit_media',
      'administration','partenariat','post_event'
    )),
  add column if not exists audience_key text,
  add column if not exists audience_filters jsonb not null default '{}'::jsonb,
  add column if not exists content_mode text
    check (content_mode in ('inline', 'template')),
  add column if not exists brevo_template_id integer,
  add column if not exists sent_count integer not null default 0,
  add column if not exists error_count integer not null default 0,
  add column if not exists sent_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists test_email_sent_at timestamptz;

comment on column public.email_campaigns.category is
  'P8.3 — lien P8.1 categorie pref. Filtre RGPD : un contact avec pref_<category>=false est exclu.';
comment on column public.email_campaigns.audience_key is
  'P8.3 — cle de l audience predefinie (ex: exposants_paid).';
comment on column public.email_campaigns.audience_filters is
  'P8.3 — filtres additionnels (poles, etapes, langue).';
comment on column public.email_campaigns.content_mode is
  'P8.3 — inline (body_html cote app) ou template (brevo_template_id).';
comment on column public.email_campaigns.test_email_sent_at is
  'P8.3 — timestamp du dernier test envoye. Obligatoire avant send.';

create index if not exists email_campaigns_status_idx
  on public.email_campaigns (status, created_at desc);
create index if not exists email_campaigns_scheduled_idx
  on public.email_campaigns (scheduled_at)
  where status = 'scheduled' and scheduled_at is not null;

-- 3. Table campaign_recipients.
create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'error', 'skipped')),
  skip_reason text
    check (skip_reason is null or skip_reason in (
      'unsubscribed', 'pref_off', 'invalid_email', 'duplicate'
    )),
  brevo_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists campaign_recipients_campaign_idx
  on public.campaign_recipients (campaign_id, status);
create index if not exists campaign_recipients_contact_idx
  on public.campaign_recipients (contact_id)
  where contact_id is not null;

comment on table public.campaign_recipients is
  'P8.3 — log d envoi par contact. Inclut les skipped (pref_off, unsubscribed) pour tracabilite RGPD + debug.';

-- 4. RLS — admin/sales lecture, admin/super_admin write (server actions
--    enforce le role granulaire ; RLS est defense in depth).
alter table public.campaign_recipients enable row level security;

drop policy if exists "campaign_recipients_staff_all" on public.campaign_recipients;
create policy "campaign_recipients_staff_all" on public.campaign_recipients
  for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- email_campaigns RLS deja en place (legacy P5).
