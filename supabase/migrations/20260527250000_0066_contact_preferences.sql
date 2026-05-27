-- Migration 0066 — P8.1 : préférences communication par contact.
--
-- Phase 1/5 du plan P8 (emailing événementiel). Fondation data : table
-- 1:1 contact_preferences avec 7 catégories bool + 7 flags lock_admin
-- + opt-out RGPD global. Backfill toutes les rows existantes.
--
-- Catégories (décision Cowork 2026-05-26) :
--   - general       : newsletter, save-the-date, actu MDS
--   - exposant      : logistique, planning, kit média, badges (auto-coché à signature)
--   - facturation   : reminders paiement, factures (auto-coché à signature)
--   - kit_media     : livraison kit communication
--   - administration: badges, formulaires admin (auto-coché à signature)
--   - partenariat   : opportunités cross-sell, programme affiliation
--   - post_event    : recap, replay, save-the-date édition suivante
--
-- Decision deviation vs brief :
--   - Brief utilise `private.is_admin()` dans le trigger lock enforcement.
--     Notre archi : tous les writes passent par service-role (admin server
--     actions ET self actions via espace-exposant JWT cookie, pas
--     Supabase auth). `auth.uid()` est null cote service-role -> les RLS
--     helpers retournent false meme pour un admin legitime.
--   - Solution : le trigger detecte le contexte via `NEW.updated_by_user_id` :
--     si non-null = admin a explicitement set son user_id = autorise tout.
--     si null = self/system = enforce locks.
--   - Les server actions admin doivent toujours setter updated_by_user_id
--     = profile.id, les self actions le laissent a null. C'est gate-keeping
--     applicatif renforce par le trigger.

-- ----------------------------------------------------------------------------
-- 1. Table contact_preferences (1:1 avec contacts)
-- ----------------------------------------------------------------------------

create table if not exists public.contact_preferences (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.contacts(id) on delete cascade,

  pref_general boolean not null default true,
  pref_exposant boolean not null default false,
  pref_facturation boolean not null default false,
  pref_kit_media boolean not null default false,
  pref_administration boolean not null default false,
  pref_partenariat boolean not null default false,
  pref_post_event boolean not null default false,

  general_locked_by_admin boolean not null default false,
  exposant_locked_by_admin boolean not null default false,
  facturation_locked_by_admin boolean not null default false,
  kit_media_locked_by_admin boolean not null default false,
  administration_locked_by_admin boolean not null default false,
  partenariat_locked_by_admin boolean not null default false,
  post_event_locked_by_admin boolean not null default false,

  unsubscribed_all_at timestamptz,
  unsubscribed_reason text,

  updated_by_user_id uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists contact_preferences_contact_idx
  on public.contact_preferences (contact_id);
create index if not exists contact_preferences_unsubscribed_idx
  on public.contact_preferences (unsubscribed_all_at)
  where unsubscribed_all_at is not null;

comment on table public.contact_preferences is
  'P8.1 — preferences communication par contact (7 categories + 7 locks admin + opt-out RGPD global).';

-- ----------------------------------------------------------------------------
-- 2. RLS : admin/sales/super_admin manage all
--    Les contacts (espace-exposant JWT cookie, pas Supabase auth) passent
--    par les server actions service-role + check applicatif. Aucune RLS
--    contact directe (pas d'identite Supabase a matcher).
-- ----------------------------------------------------------------------------

alter table public.contact_preferences enable row level security;

drop policy if exists "contact_preferences_admin_all" on public.contact_preferences;
create policy "contact_preferences_admin_all" on public.contact_preferences
  for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());

-- ----------------------------------------------------------------------------
-- 3. Trigger : enforce locks pour les self-updates
--    Strategie : si NEW.updated_by_user_id est non-null = update admin =
--    on autorise tout (l'action server-action a deja verifie l'auth).
--    Si null = update self/system = on revert silencieusement toute
--    tentative de modif d'une pref locked, ET on garde les flags locked
--    tels qu'ils etaient.
-- ----------------------------------------------------------------------------

create or replace function public.enforce_contact_preferences_locks()
returns trigger
language plpgsql
as $$
begin
  -- Cas admin context : updated_by_user_id explicitement set -> autorise tout.
  if new.updated_by_user_id is not null then
    return new;
  end if;

  -- Cas self/system : revert toute tentative de modifier une pref locked.
  if old.general_locked_by_admin and new.pref_general is distinct from old.pref_general then
    new.pref_general := old.pref_general;
  end if;
  if old.exposant_locked_by_admin and new.pref_exposant is distinct from old.pref_exposant then
    new.pref_exposant := old.pref_exposant;
  end if;
  if old.facturation_locked_by_admin and new.pref_facturation is distinct from old.pref_facturation then
    new.pref_facturation := old.pref_facturation;
  end if;
  if old.kit_media_locked_by_admin and new.pref_kit_media is distinct from old.pref_kit_media then
    new.pref_kit_media := old.pref_kit_media;
  end if;
  if old.administration_locked_by_admin and new.pref_administration is distinct from old.pref_administration then
    new.pref_administration := old.pref_administration;
  end if;
  if old.partenariat_locked_by_admin and new.pref_partenariat is distinct from old.pref_partenariat then
    new.pref_partenariat := old.pref_partenariat;
  end if;
  if old.post_event_locked_by_admin and new.pref_post_event is distinct from old.pref_post_event then
    new.pref_post_event := old.pref_post_event;
  end if;

  -- Self/system NE PEUT PAS toucher aux flags locked_by_admin (revert).
  new.general_locked_by_admin := old.general_locked_by_admin;
  new.exposant_locked_by_admin := old.exposant_locked_by_admin;
  new.facturation_locked_by_admin := old.facturation_locked_by_admin;
  new.kit_media_locked_by_admin := old.kit_media_locked_by_admin;
  new.administration_locked_by_admin := old.administration_locked_by_admin;
  new.partenariat_locked_by_admin := old.partenariat_locked_by_admin;
  new.post_event_locked_by_admin := old.post_event_locked_by_admin;

  return new;
end;
$$;

drop trigger if exists enforce_contact_preferences_locks_trigger on public.contact_preferences;
create trigger enforce_contact_preferences_locks_trigger
  before update on public.contact_preferences
  for each row
  execute function public.enforce_contact_preferences_locks();

-- ----------------------------------------------------------------------------
-- 4. Trigger : auto-create row contact_preferences a chaque nouveau contact
-- ----------------------------------------------------------------------------

create or replace function public.create_default_contact_preferences()
returns trigger
language plpgsql
as $$
begin
  insert into public.contact_preferences (contact_id)
  values (new.id)
  on conflict (contact_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_default_contact_preferences_trigger on public.contacts;
create trigger create_default_contact_preferences_trigger
  after insert on public.contacts
  for each row
  execute function public.create_default_contact_preferences();

-- ----------------------------------------------------------------------------
-- 5. Backfill : creer une row contact_preferences pour chaque contact existant
-- ----------------------------------------------------------------------------

insert into public.contact_preferences (contact_id)
select id from public.contacts
where id not in (select contact_id from public.contact_preferences)
on conflict (contact_id) do nothing;
