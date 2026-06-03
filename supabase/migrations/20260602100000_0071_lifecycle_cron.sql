-- Migration 0071 — P8.5 : Lifecycle relances automatiques (8 regles + pg_cron + queue + audit).
--
-- Architecture (cf. brief P8.5) :
--   1. pg_cron Supabase appelle fn_detect_<rule>() toutes les heures (8 schedules, espaces de 5 min).
--   2. fn_detect_* SELECT les contacts eligibles selon la regle (SQL natif).
--      Filtres RGPD : pref_<category>=true, unsubscribed_all_at IS NULL,
--      email_confidence != 'low' (pour les regles marketing).
--      Idempotence : lifecycle_recipients PK (rule_id, contact_id).
--   3. INSERT INTO lifecycle_send_queue (status='pending').
--   4. Vercel Cron (/api/cron/lifecycle/process toutes les 5 min) consomme la
--      queue, envoie via Brevo (reuse sendCampaignBatch P8.3), update status.
--
-- Mapping pref_category brief -> repo (decision P8.5) :
--   "marketing"        -> pref_general       (newsletter, save-the-date)
--   "event_logistics"  -> pref_exposant      (logistique stand)
--   "billing"          -> pref_facturation   (paiements, factures)
--   autres : meme nom (pref_kit_media, pref_administration, pref_partenariat, pref_post_event)
--
-- 8 regles V1 :
--   1. signup_24h_no_quote          (pref_general)
--   2. quote_sent_7d_no_signature   (pref_general)
--   3. signed_3d_no_payment         (pref_facturation)
--   4. payment_1d_welcome           (pref_general)
--   5. event_J30_reminder           (pref_exposant)
--   6. event_J7_reminder            (pref_exposant)
--   7. event_J1_reminder            (pref_exposant)
--   8. post_event_2d_thanks         (pref_post_event)

-- ============================================================================
-- 1. Activation extension pg_cron
-- ============================================================================
-- pg_cron est dans le schema 'cron'. L extension doit etre creee par un
-- superuser (Supabase Dashboard > Database > Extensions). Si activee deja
-- cote UI, le CREATE EXTENSION IF NOT EXISTS est no-op.

create extension if not exists pg_cron with schema extensions;

-- ============================================================================
-- 2. Tables
-- ============================================================================

create table if not exists public.lifecycle_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text unique not null,
  label_fr text not null,
  label_en text not null,
  description_fr text,
  description_en text,
  pref_category text not null check (pref_category in (
    'pref_general', 'pref_exposant', 'pref_facturation',
    'pref_kit_media', 'pref_administration', 'pref_partenariat', 'pref_post_event'
  )),
  is_active boolean not null default false,
  cron_schedule text not null default '0 * * * *',
  subject_fr text not null,
  subject_en text not null,
  body_fr_html text not null,
  body_en_html text not null,
  en_translated_by_ai_at timestamptz,
  fr_translated_by_ai_at timestamptz,
  translation_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null
);

comment on table public.lifecycle_rules is
  'P8.5 - 8 regles de relance automatique (cycle de vie prospect/partenaire). is_active=false par defaut.';

create table if not exists public.lifecycle_send_queue (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.lifecycle_rules(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  status text not null check (status in ('pending', 'sent', 'error', 'cancelled')),
  scheduled_for timestamptz not null default now(),
  attempted_at timestamptz,
  sent_at timestamptz,
  error_message text,
  retry_count int not null default 0,
  brevo_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists lifecycle_queue_pending_idx
  on public.lifecycle_send_queue (status, scheduled_for)
  where status = 'pending';

create index if not exists lifecycle_queue_rule_idx
  on public.lifecycle_send_queue (rule_id, status);

comment on table public.lifecycle_send_queue is
  'P8.5 - queue d envoi consommee par /api/cron/lifecycle/process toutes les 5 min.';

create table if not exists public.lifecycle_recipients (
  rule_id uuid not null references public.lifecycle_rules(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (rule_id, contact_id)
);

comment on table public.lifecycle_recipients is
  'P8.5 - idempotence : 1 contact ne recoit JAMAIS 2x la meme regle. Reset via re-target action (super_admin).';

create table if not exists public.lifecycle_executions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.lifecycle_rules(id) on delete cascade,
  executed_at timestamptz not null default now(),
  candidates_count int not null default 0,
  queued_count int not null default 0,
  skipped_count int not null default 0,
  duration_ms int not null default 0,
  error text
);

create index if not exists lifecycle_executions_rule_idx
  on public.lifecycle_executions (rule_id, executed_at desc);

comment on table public.lifecycle_executions is
  'P8.5 - audit des executions pg_cron par regle (1 row par tick).';

-- ============================================================================
-- 3. RLS - admin/sales/super_admin manage all (service-role bypass RLS)
-- ============================================================================

alter table public.lifecycle_rules enable row level security;
alter table public.lifecycle_send_queue enable row level security;
alter table public.lifecycle_recipients enable row level security;
alter table public.lifecycle_executions enable row level security;

drop policy if exists "lifecycle_rules_admin_all" on public.lifecycle_rules;
create policy "lifecycle_rules_admin_all" on public.lifecycle_rules
  for all to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

drop policy if exists "lifecycle_queue_admin_all" on public.lifecycle_send_queue;
create policy "lifecycle_queue_admin_all" on public.lifecycle_send_queue
  for all to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

drop policy if exists "lifecycle_recipients_admin_all" on public.lifecycle_recipients;
create policy "lifecycle_recipients_admin_all" on public.lifecycle_recipients
  for all to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

drop policy if exists "lifecycle_executions_admin_all" on public.lifecycle_executions;
create policy "lifecycle_executions_admin_all" on public.lifecycle_executions
  for all to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ============================================================================
-- 4. Helper fonction commune : queue les eligibles + audit
-- ============================================================================

create or replace function public.fn_lifecycle_queue_recipients(
  p_rule_key text,
  p_eligible_contact_ids uuid[],
  p_prospect_map jsonb -- {contact_id: prospect_id} pour personnalisation
) returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule_id uuid;
  v_queued int := 0;
  v_contact_id uuid;
  v_prospect_id uuid;
begin
  select id into v_rule_id from public.lifecycle_rules
  where rule_key = p_rule_key and is_active = true;

  if v_rule_id is null then
    return 0;
  end if;

  foreach v_contact_id in array p_eligible_contact_ids loop
    v_prospect_id := (p_prospect_map ->> v_contact_id::text)::uuid;
    insert into public.lifecycle_recipients (rule_id, contact_id)
    values (v_rule_id, v_contact_id)
    on conflict do nothing;
    if found then
      insert into public.lifecycle_send_queue
        (rule_id, contact_id, prospect_id, status, scheduled_for)
      values (v_rule_id, v_contact_id, v_prospect_id, 'pending', now());
      v_queued := v_queued + 1;
    end if;
  end loop;

  return v_queued;
end;
$$;

-- ============================================================================
-- 5. 8 fonctions fn_detect_*
-- ============================================================================

-- 5.1 signup_24h_no_quote : prospect cree >=24h sans devis envoye
create or replace function public.fn_detect_signup_24h_no_quote()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule_id uuid;
  v_count int := 0;
  v_start timestamptz := now();
  v_eligible uuid[];
  v_map jsonb := '{}'::jsonb;
  r record;
begin
  select id into v_rule_id from public.lifecycle_rules
  where rule_key = 'signup_24h_no_quote' and is_active = true;
  if v_rule_id is null then return 0; end if;

  for r in
    select p.id as prospect_id, c.id as contact_id
    from public.prospects p
    join public.contacts c on c.id = p.primary_contact_id
    left join public.contact_preferences cp on cp.contact_id = c.id
    where p.created_at <= now() - interval '24 hours'
      and p.sellsy_devis_emitted_at is null
      and p.status = 'lead'
      and p.is_test = false
      and coalesce(cp.pref_general, true) = true
      and cp.unsubscribed_all_at is null
      and c.email_confidence != 'low'
      and not exists (
        select 1 from public.lifecycle_recipients lr
        where lr.rule_id = v_rule_id and lr.contact_id = c.id
      )
  loop
    v_eligible := array_append(v_eligible, r.contact_id);
    v_map := v_map || jsonb_build_object(r.contact_id::text, to_jsonb(r.prospect_id));
  end loop;

  v_count := public.fn_lifecycle_queue_recipients('signup_24h_no_quote', v_eligible, v_map);

  insert into public.lifecycle_executions
    (rule_id, candidates_count, queued_count, duration_ms)
  values (v_rule_id, coalesce(array_length(v_eligible, 1), 0), v_count,
          extract(milliseconds from (now() - v_start))::int);
  return v_count;
end;
$$;

-- 5.2 quote_sent_7d_no_signature
create or replace function public.fn_detect_quote_sent_7d_no_signature()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule_id uuid;
  v_count int := 0;
  v_start timestamptz := now();
  v_eligible uuid[];
  v_map jsonb := '{}'::jsonb;
  r record;
begin
  select id into v_rule_id from public.lifecycle_rules
  where rule_key = 'quote_sent_7d_no_signature' and is_active = true;
  if v_rule_id is null then return 0; end if;

  for r in
    select p.id as prospect_id, c.id as contact_id
    from public.prospects p
    join public.contacts c on c.id = p.primary_contact_id
    left join public.contact_preferences cp on cp.contact_id = c.id
    where p.sellsy_devis_emitted_at is not null
      and p.sellsy_devis_emitted_at <= now() - interval '7 days'
      and p.signed_at is null
      and p.status not in ('perdu')
      and p.is_test = false
      and coalesce(cp.pref_general, true) = true
      and cp.unsubscribed_all_at is null
      and c.email_confidence != 'low'
      and not exists (
        select 1 from public.lifecycle_recipients lr
        where lr.rule_id = v_rule_id and lr.contact_id = c.id
      )
  loop
    v_eligible := array_append(v_eligible, r.contact_id);
    v_map := v_map || jsonb_build_object(r.contact_id::text, to_jsonb(r.prospect_id));
  end loop;

  v_count := public.fn_lifecycle_queue_recipients('quote_sent_7d_no_signature', v_eligible, v_map);
  insert into public.lifecycle_executions
    (rule_id, candidates_count, queued_count, duration_ms)
  values (v_rule_id, coalesce(array_length(v_eligible, 1), 0), v_count,
          extract(milliseconds from (now() - v_start))::int);
  return v_count;
end;
$$;

-- 5.3 signed_3d_no_payment
create or replace function public.fn_detect_signed_3d_no_payment()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule_id uuid;
  v_count int := 0;
  v_start timestamptz := now();
  v_eligible uuid[];
  v_map jsonb := '{}'::jsonb;
  r record;
begin
  select id into v_rule_id from public.lifecycle_rules
  where rule_key = 'signed_3d_no_payment' and is_active = true;
  if v_rule_id is null then return 0; end if;

  for r in
    select p.id as prospect_id, c.id as contact_id
    from public.prospects p
    join public.contacts c on c.id = p.primary_contact_id
    left join public.contact_preferences cp on cp.contact_id = c.id
    where p.signed_at is not null
      and p.signed_at <= now() - interval '3 days'
      and p.acompte_paid_at is null
      and p.is_test = false
      and coalesce(cp.pref_facturation, false) = true
      and cp.unsubscribed_all_at is null
      and not exists (
        select 1 from public.lifecycle_recipients lr
        where lr.rule_id = v_rule_id and lr.contact_id = c.id
      )
  loop
    v_eligible := array_append(v_eligible, r.contact_id);
    v_map := v_map || jsonb_build_object(r.contact_id::text, to_jsonb(r.prospect_id));
  end loop;

  v_count := public.fn_lifecycle_queue_recipients('signed_3d_no_payment', v_eligible, v_map);
  insert into public.lifecycle_executions
    (rule_id, candidates_count, queued_count, duration_ms)
  values (v_rule_id, coalesce(array_length(v_eligible, 1), 0), v_count,
          extract(milliseconds from (now() - v_start))::int);
  return v_count;
end;
$$;

-- 5.4 payment_1d_welcome : acompte paye il y a entre 1 et 3 jours
create or replace function public.fn_detect_payment_1d_welcome()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule_id uuid;
  v_count int := 0;
  v_start timestamptz := now();
  v_eligible uuid[];
  v_map jsonb := '{}'::jsonb;
  r record;
begin
  select id into v_rule_id from public.lifecycle_rules
  where rule_key = 'payment_1d_welcome' and is_active = true;
  if v_rule_id is null then return 0; end if;

  for r in
    select p.id as prospect_id, c.id as contact_id
    from public.prospects p
    join public.contacts c on c.id = p.primary_contact_id
    left join public.contact_preferences cp on cp.contact_id = c.id
    where p.acompte_paid_at is not null
      and p.acompte_paid_at <= now() - interval '1 day'
      and p.acompte_paid_at >= now() - interval '3 days'
      and p.is_test = false
      and coalesce(cp.pref_general, true) = true
      and cp.unsubscribed_all_at is null
      and not exists (
        select 1 from public.lifecycle_recipients lr
        where lr.rule_id = v_rule_id and lr.contact_id = c.id
      )
  loop
    v_eligible := array_append(v_eligible, r.contact_id);
    v_map := v_map || jsonb_build_object(r.contact_id::text, to_jsonb(r.prospect_id));
  end loop;

  v_count := public.fn_lifecycle_queue_recipients('payment_1d_welcome', v_eligible, v_map);
  insert into public.lifecycle_executions
    (rule_id, candidates_count, queued_count, duration_ms)
  values (v_rule_id, coalesce(array_length(v_eligible, 1), 0), v_count,
          extract(milliseconds from (now() - v_start))::int);
  return v_count;
end;
$$;

-- 5.5 event_J30_reminder : J-30 (relance signed only)
create or replace function public.fn_detect_event_j30_reminder()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule_id uuid;
  v_count int := 0;
  v_start timestamptz := now();
  v_eligible uuid[];
  v_map jsonb := '{}'::jsonb;
  v_season_start date;
  r record;
begin
  select id into v_rule_id from public.lifecycle_rules
  where rule_key = 'event_J30_reminder' and is_active = true;
  if v_rule_id is null then return 0; end if;

  select start_date into v_season_start from public.seasons
  where is_active = true limit 1;
  if v_season_start is null then return 0; end if;
  -- J-30 (tolerance 1 jour)
  if abs((v_season_start - current_date) - 30) > 0 then
    insert into public.lifecycle_executions (rule_id, candidates_count, queued_count, duration_ms)
    values (v_rule_id, 0, 0, extract(milliseconds from (now() - v_start))::int);
    return 0;
  end if;

  for r in
    select p.id as prospect_id, c.id as contact_id
    from public.prospects p
    join public.contacts c on c.id = p.primary_contact_id
    left join public.contact_preferences cp on cp.contact_id = c.id
    where p.signed_at is not null
      and p.is_test = false
      and coalesce(cp.pref_exposant, false) = true
      and cp.unsubscribed_all_at is null
      and not exists (
        select 1 from public.lifecycle_recipients lr
        where lr.rule_id = v_rule_id and lr.contact_id = c.id
      )
  loop
    v_eligible := array_append(v_eligible, r.contact_id);
    v_map := v_map || jsonb_build_object(r.contact_id::text, to_jsonb(r.prospect_id));
  end loop;

  v_count := public.fn_lifecycle_queue_recipients('event_J30_reminder', v_eligible, v_map);
  insert into public.lifecycle_executions
    (rule_id, candidates_count, queued_count, duration_ms)
  values (v_rule_id, coalesce(array_length(v_eligible, 1), 0), v_count,
          extract(milliseconds from (now() - v_start))::int);
  return v_count;
end;
$$;

-- 5.6 event_J7_reminder
create or replace function public.fn_detect_event_j7_reminder()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule_id uuid;
  v_count int := 0;
  v_start timestamptz := now();
  v_eligible uuid[];
  v_map jsonb := '{}'::jsonb;
  v_season_start date;
  r record;
begin
  select id into v_rule_id from public.lifecycle_rules
  where rule_key = 'event_J7_reminder' and is_active = true;
  if v_rule_id is null then return 0; end if;
  select start_date into v_season_start from public.seasons
  where is_active = true limit 1;
  if v_season_start is null then return 0; end if;
  if abs((v_season_start - current_date) - 7) > 0 then
    insert into public.lifecycle_executions (rule_id, candidates_count, queued_count, duration_ms)
    values (v_rule_id, 0, 0, extract(milliseconds from (now() - v_start))::int);
    return 0;
  end if;

  for r in
    select p.id as prospect_id, c.id as contact_id
    from public.prospects p
    join public.contacts c on c.id = p.primary_contact_id
    left join public.contact_preferences cp on cp.contact_id = c.id
    where p.signed_at is not null
      and p.is_test = false
      and coalesce(cp.pref_exposant, false) = true
      and cp.unsubscribed_all_at is null
      and not exists (
        select 1 from public.lifecycle_recipients lr
        where lr.rule_id = v_rule_id and lr.contact_id = c.id
      )
  loop
    v_eligible := array_append(v_eligible, r.contact_id);
    v_map := v_map || jsonb_build_object(r.contact_id::text, to_jsonb(r.prospect_id));
  end loop;

  v_count := public.fn_lifecycle_queue_recipients('event_J7_reminder', v_eligible, v_map);
  insert into public.lifecycle_executions
    (rule_id, candidates_count, queued_count, duration_ms)
  values (v_rule_id, coalesce(array_length(v_eligible, 1), 0), v_count,
          extract(milliseconds from (now() - v_start))::int);
  return v_count;
end;
$$;

-- 5.7 event_J1_reminder
create or replace function public.fn_detect_event_j1_reminder()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule_id uuid;
  v_count int := 0;
  v_start timestamptz := now();
  v_eligible uuid[];
  v_map jsonb := '{}'::jsonb;
  v_season_start date;
  r record;
begin
  select id into v_rule_id from public.lifecycle_rules
  where rule_key = 'event_J1_reminder' and is_active = true;
  if v_rule_id is null then return 0; end if;
  select start_date into v_season_start from public.seasons
  where is_active = true limit 1;
  if v_season_start is null then return 0; end if;
  if abs((v_season_start - current_date) - 1) > 0 then
    insert into public.lifecycle_executions (rule_id, candidates_count, queued_count, duration_ms)
    values (v_rule_id, 0, 0, extract(milliseconds from (now() - v_start))::int);
    return 0;
  end if;

  for r in
    select p.id as prospect_id, c.id as contact_id
    from public.prospects p
    join public.contacts c on c.id = p.primary_contact_id
    left join public.contact_preferences cp on cp.contact_id = c.id
    where p.signed_at is not null
      and p.is_test = false
      and coalesce(cp.pref_exposant, false) = true
      and cp.unsubscribed_all_at is null
      and not exists (
        select 1 from public.lifecycle_recipients lr
        where lr.rule_id = v_rule_id and lr.contact_id = c.id
      )
  loop
    v_eligible := array_append(v_eligible, r.contact_id);
    v_map := v_map || jsonb_build_object(r.contact_id::text, to_jsonb(r.prospect_id));
  end loop;

  v_count := public.fn_lifecycle_queue_recipients('event_J1_reminder', v_eligible, v_map);
  insert into public.lifecycle_executions
    (rule_id, candidates_count, queued_count, duration_ms)
  values (v_rule_id, coalesce(array_length(v_eligible, 1), 0), v_count,
          extract(milliseconds from (now() - v_start))::int);
  return v_count;
end;
$$;

-- 5.8 post_event_2d_thanks
create or replace function public.fn_detect_post_event_2d_thanks()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rule_id uuid;
  v_count int := 0;
  v_start timestamptz := now();
  v_eligible uuid[];
  v_map jsonb := '{}'::jsonb;
  v_season_start date;
  r record;
begin
  select id into v_rule_id from public.lifecycle_rules
  where rule_key = 'post_event_2d_thanks' and is_active = true;
  if v_rule_id is null then return 0; end if;
  select start_date into v_season_start from public.seasons
  where is_active = true limit 1;
  if v_season_start is null then return 0; end if;
  -- J+2 = 2 jours apres l event
  if abs((current_date - v_season_start) - 2) > 0 then
    insert into public.lifecycle_executions (rule_id, candidates_count, queued_count, duration_ms)
    values (v_rule_id, 0, 0, extract(milliseconds from (now() - v_start))::int);
    return 0;
  end if;

  for r in
    select p.id as prospect_id, c.id as contact_id
    from public.prospects p
    join public.contacts c on c.id = p.primary_contact_id
    left join public.contact_preferences cp on cp.contact_id = c.id
    where p.signed_at is not null
      and p.is_test = false
      and coalesce(cp.pref_post_event, false) = true
      and cp.unsubscribed_all_at is null
      and not exists (
        select 1 from public.lifecycle_recipients lr
        where lr.rule_id = v_rule_id and lr.contact_id = c.id
      )
  loop
    v_eligible := array_append(v_eligible, r.contact_id);
    v_map := v_map || jsonb_build_object(r.contact_id::text, to_jsonb(r.prospect_id));
  end loop;

  v_count := public.fn_lifecycle_queue_recipients('post_event_2d_thanks', v_eligible, v_map);
  insert into public.lifecycle_executions
    (rule_id, candidates_count, queued_count, duration_ms)
  values (v_rule_id, coalesce(array_length(v_eligible, 1), 0), v_count,
          extract(milliseconds from (now() - v_start))::int);
  return v_count;
end;
$$;

-- ============================================================================
-- 6. Seed des 8 regles (is_active=false, Phil active manuellement)
-- ============================================================================

insert into public.lifecycle_rules (rule_key, label_fr, label_en, pref_category, cron_schedule, subject_fr, subject_en, body_fr_html, body_en_html, description_fr, description_en)
values
  (
    'signup_24h_no_quote',
    'Signup +24h sans devis',
    'Signup +24h without quote',
    'pref_general',
    '5 * * * *',
    '{prenom}, on construit ensemble votre stand MDS 2026 ?',
    '{prenom}, let''s build your MDS 2026 booth together?',
    '<p>Bonjour {prenom},</p><p>Vous avez créé votre compte sur MediaDays Solutions il y a 24h et je voulais vous proposer un échange rapide pour finaliser votre devis MDS 2026.</p><p>Quelle est votre dispo cette semaine pour 15 minutes au téléphone ?</p><p>À très vite,<br/>L''équipe MDS</p>',
    '<p>Hi {prenom},</p><p>You created your account on MediaDays Solutions 24h ago and I wanted to suggest a quick call to finalize your MDS 2026 quote.</p><p>What is your availability this week for a 15-min phone call?</p><p>Talk soon,<br/>The MDS team</p>',
    'Relance 24h apres signup sans devis envoye.',
    'Follow-up 24h after signup without quote sent.'
  ),
  (
    'quote_sent_7d_no_signature',
    'Devis envoyé +7j sans signature',
    'Quote sent +7d without signature',
    'pref_general',
    '10 * * * *',
    '{prenom}, votre devis MDS 2026 vous attend',
    '{prenom}, your MDS 2026 quote is waiting',
    '<p>Bonjour {prenom},</p><p>Votre devis pour {societe} a été envoyé il y a 7 jours. Avez-vous des questions ou besoin d''ajustements ?</p><p>Je reste à votre disposition.</p><p>L''équipe MDS</p>',
    '<p>Hi {prenom},</p><p>Your quote for {societe} was sent 7 days ago. Any questions or adjustments needed?</p><p>I''m here to help.</p><p>The MDS team</p>',
    'Relance 7 jours apres envoi du devis sans signature.',
    'Follow-up 7 days after quote sent without signature.'
  ),
  (
    'signed_3d_no_payment',
    'Devis signé +3j sans paiement',
    'Quote signed +3d without payment',
    'pref_facturation',
    '15 * * * *',
    '{prenom}, finalisons votre inscription MDS 2026',
    '{prenom}, let''s finalize your MDS 2026 registration',
    '<p>Bonjour {prenom},</p><p>Merci d''avoir signé votre devis pour {societe} ! Il ne reste plus que le paiement de l''acompte 30% pour valider définitivement votre participation.</p><p>Le lien Stripe vous a été envoyé. Si vous rencontrez un souci, dites-le moi.</p><p>L''équipe MDS</p>',
    '<p>Hi {prenom},</p><p>Thank you for signing the quote for {societe}! Only the 30% deposit payment is left to fully validate your participation.</p><p>The Stripe link was sent to you. Let me know if you have any issues.</p><p>The MDS team</p>',
    'Relance 3 jours apres signature sans paiement de l acompte.',
    'Follow-up 3 days after signature without deposit payment.'
  ),
  (
    'payment_1d_welcome',
    'Paiement reçu — bienvenue J+1',
    'Payment received — welcome D+1',
    'pref_general',
    '20 * * * *',
    'Bienvenue {prenom} — votre espace partenaire est prêt !',
    'Welcome {prenom} — your partner space is ready!',
    '<p>Bonjour {prenom},</p><p>Bienvenue parmi les partenaires MDS 2026 ! Votre paiement est confirmé. Votre espace personnel <a href="https://mediadays.solutions/fr/espace-partenaire">est accessible ici</a>.</p><p>Vous y trouverez votre kit communication, la logistique de votre stand et bien plus.</p><p>L''équipe MDS</p>',
    '<p>Hi {prenom},</p><p>Welcome to the MDS 2026 partners! Your payment is confirmed. Your personal space <a href="https://mediadays.solutions/en/espace-partenaire">is accessible here</a>.</p><p>You will find your communication kit, booth logistics and more.</p><p>The MDS team</p>',
    'Email de bienvenue 1 jour apres paiement de l acompte.',
    'Welcome email 1 day after deposit payment.'
  ),
  (
    'event_J30_reminder',
    'J-30 — checklist logistique',
    'D-30 — logistics checklist',
    'pref_exposant',
    '25 * * * *',
    'MDS 2026 dans 30 jours — checklist logistique',
    'MDS 2026 in 30 days — logistics checklist',
    '<p>Bonjour {prenom},</p><p>MDS 2026 dans 30 jours ! Pensez à vérifier votre checklist logistique partenaire : badges, plan de stand, signalétique, kit communication.</p><p><a href="https://mediadays.solutions/fr/espace-partenaire">Accéder à mon espace partenaire</a></p><p>L''équipe MDS</p>',
    '<p>Hi {prenom},</p><p>MDS 2026 in 30 days! Please check your partner logistics checklist: badges, booth plan, signage, communication kit.</p><p><a href="https://mediadays.solutions/en/espace-partenaire">Access my partner space</a></p><p>The MDS team</p>',
    'Rappel logistique 30 jours avant l ouverture du salon.',
    'Logistics reminder 30 days before the event opens.'
  ),
  (
    'event_J7_reminder',
    'J-7 — plan de stand et badges',
    'D-7 — booth plan and badges',
    'pref_exposant',
    '30 * * * *',
    'MDS 2026 dans 7 jours — votre plan de stand et badges',
    'MDS 2026 in 7 days — your booth plan and badges',
    '<p>Bonjour {prenom},</p><p>Plus que 7 jours avant MDS 2026 ! Téléchargez votre plan de stand finalisé et vos badges depuis votre espace partenaire.</p><p><a href="https://mediadays.solutions/fr/espace-partenaire">Mes documents salon</a></p><p>L''équipe MDS</p>',
    '<p>Hi {prenom},</p><p>Only 7 days before MDS 2026! Download your final booth plan and badges from your partner space.</p><p><a href="https://mediadays.solutions/en/espace-partenaire">My event documents</a></p><p>The MDS team</p>',
    'Rappel finalisation 7 jours avant.',
    'Final reminder 7 days before.'
  ),
  (
    'event_J1_reminder',
    'J-1 — dernière info pratique',
    'D-1 — last practical info',
    'pref_exposant',
    '35 * * * *',
    'Demain MDS 2026 — dernière info pratique',
    'Tomorrow MDS 2026 — last practical info',
    '<p>Bonjour {prenom},</p><p>Demain c''est le grand jour ! Voici les infos pratiques de dernière minute : accès, horaires de montage, contact équipe.</p><p>À demain !<br/>L''équipe MDS</p>',
    '<p>Hi {prenom},</p><p>Tomorrow is the big day! Here is the last-minute practical info: access, setup hours, team contact.</p><p>See you tomorrow!<br/>The MDS team</p>',
    'Recap pratique la veille du salon.',
    'Practical recap the day before the event.'
  ),
  (
    'post_event_2d_thanks',
    'J+2 — merci',
    'D+2 — thank you',
    'pref_post_event',
    '40 * * * *',
    '{prenom}, merci d''avoir fait vivre MDS 2026',
    '{prenom}, thank you for making MDS 2026 alive',
    '<p>Bonjour {prenom},</p><p>Merci d''avoir fait vivre MDS 2026 avec {societe} ! Nous serions ravis d''avoir vos retours pour préparer la prochaine édition.</p><p>À très vite,<br/>L''équipe MDS</p>',
    '<p>Hi {prenom},</p><p>Thank you for bringing MDS 2026 to life with {societe}! We would love to have your feedback to prepare the next edition.</p><p>Talk soon,<br/>The MDS team</p>',
    'Remerciement 2 jours apres la cloture.',
    'Thank you email 2 days after the event closes.'
  )
on conflict (rule_key) do nothing;

-- ============================================================================
-- 7. Schedules pg_cron (8 schedules, 1 par regle, espaces de 5 min)
-- ============================================================================
-- Note : cron.schedule retourne l id du job si nouveau, ou throw si meme nom
-- existe deja. On utilise cron.unschedule + cron.schedule pour idempotence.

do $$
declare
  v_jobs text[] := array[
    'lifecycle-signup-24h',
    'lifecycle-quote-7d',
    'lifecycle-signed-3d',
    'lifecycle-payment-1d',
    'lifecycle-j30',
    'lifecycle-j7',
    'lifecycle-j1',
    'lifecycle-postevent'
  ];
  v_job text;
begin
  foreach v_job in array v_jobs loop
    perform cron.unschedule(v_job) where exists (select 1 from cron.job where jobname = v_job);
  end loop;
end $$;

select cron.schedule('lifecycle-signup-24h', '5 * * * *',  $$select public.fn_detect_signup_24h_no_quote()$$);
select cron.schedule('lifecycle-quote-7d',   '10 * * * *', $$select public.fn_detect_quote_sent_7d_no_signature()$$);
select cron.schedule('lifecycle-signed-3d',  '15 * * * *', $$select public.fn_detect_signed_3d_no_payment()$$);
select cron.schedule('lifecycle-payment-1d', '20 * * * *', $$select public.fn_detect_payment_1d_welcome()$$);
select cron.schedule('lifecycle-j30',        '25 * * * *', $$select public.fn_detect_event_j30_reminder()$$);
select cron.schedule('lifecycle-j7',         '30 * * * *', $$select public.fn_detect_event_j7_reminder()$$);
select cron.schedule('lifecycle-j1',         '35 * * * *', $$select public.fn_detect_event_j1_reminder()$$);
select cron.schedule('lifecycle-postevent',  '40 * * * *', $$select public.fn_detect_post_event_2d_thanks()$$);
