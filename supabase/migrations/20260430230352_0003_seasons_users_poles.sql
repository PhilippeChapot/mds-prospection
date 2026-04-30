-- Migration 0003 — seasons + users + poles
-- Tables racine sans FK sortantes (sauf users → auth.users).

-- ========================================================================== --
-- seasons : editions du salon (cf. SPEC §3.15)
-- ========================================================================== --
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_fr text not null,
  name_en text not null,
  start_date date,
  end_date date,
  is_active boolean not null default false,
  status public.season_status not null default 'planning',
  created_at timestamptz not null default now()
);

-- Une seule saison `is_active = true` a la fois.
create unique index seasons_one_active_idx on public.seasons (is_active) where is_active = true;

comment on table public.seasons is 'Editions du salon MDS — multi-saison (SPEC §3.15)';

-- ========================================================================== --
-- users : admins de l'app (extension de auth.users)
-- ========================================================================== --
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'sales',
  totp_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.users is 'Profil applicatif des admins (lie a auth.users)';

-- ========================================================================== --
-- Trigger : sync auth.users -> public.users a la creation d'un compte
-- SECURITY DEFINER pose dans le schema `private` (jamais expose).
-- ========================================================================== --
create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    -- Premier utilisateur = admin par defaut, sinon sales (modifiable depuis l'admin).
    case when (select count(*) from public.users) = 0 then 'admin' else 'sales' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- ========================================================================== --
-- poles : 6 + INCONNU (SPEC §3.1) — transverse, pas de season_id
-- Lecture publique anonyme (necessaire pour le formulaire public).
-- ========================================================================== --
create table public.poles (
  id uuid primary key default gen_random_uuid(),
  code public.pole_code not null unique,
  name_fr text not null,
  name_en text not null,
  short_name_fr text not null,
  short_name_en text not null,
  description_fr text,
  description_en text,
  color_hex text not null,
  emoji text,
  display_order int not null default 0,
  rooms text[] not null default '{}',
  is_active boolean not null default true
);

comment on table public.poles is 'Taxonomie des 6 poles thematiques + INCONNU (SPEC §3.1)';

-- Seed des 7 poles immediatement (utilise par auto-complete des P1).
insert into public.poles (code, name_fr, name_en, short_name_fr, short_name_en, color_hex, emoji, display_order, rooms) values
  ('REGIES_RETAIL_MEDIA', '🏛️ RÉGIES & RETAIL MEDIA', '🏛️ MEDIA SALES & RETAIL MEDIA', 'RÉGIES & RETAIL MEDIA', 'MEDIA SALES & RETAIL MEDIA', '#FFCDD2', '🏛️', 1, array['Salle Delorme', 'Salle Gabriel']),
  ('AUDIO_RADIO',         '🎙️ AUDIO & RADIO',          '🎙️ AUDIO & RADIO',                'AUDIO & RADIO',          'AUDIO & RADIO',                '#F8BBD0', '🎙️', 2, array['Salle Le Nôtre rangées A-B-C', 'scène PRS']),
  ('DIFFUSION_INFRA',     '📡 DIFFUSION & INFRA',      '📡 BROADCAST & INFRA',            'DIFFUSION & INFRA',      'BROADCAST & INFRA',            '#E1BEE7', '📡', 3, array['Salle Le Nôtre rangées D-E']),
  ('VIDEO_CTV',           '🎥 VIDÉO & CTV',            '🎥 VIDEO & CTV',                  'VIDÉO & CTV',            'VIDEO & CTV',                  '#BBDEFB', '🎥', 4, array['Salle Le Nôtre rangées F-G-H', 'scène MDS']),
  ('OUTDOOR_DOOH',        '📢 OUTDOOR & DOOH',         '📢 OUTDOOR & DOOH',               'OUTDOOR & DOOH',         'OUTDOOR & DOOH',               '#FFE0B2', '📢', 5, array['Salle Le Nôtre colonne droite', 'Foyer (overflow)']),
  ('DATA_ADTECH',         '📊 DATA & ADTECH',          '📊 DATA & ADTECH',                'DATA & ADTECH',          'DATA & ADTECH',                '#C8E6C9', '📊', 6, array['Salle Delorme', 'Salle Le Nôtre', 'Foyer (overflow)']),
  ('INCONNU',             'Non classé',                'Unclassified',                    'Non classé',             'Unclassified',                 '#E5E7EB', '❔', 99, array[]::text[]);
