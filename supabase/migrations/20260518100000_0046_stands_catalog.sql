-- Migration 0046 — P6.x.2a
-- Catalogue Stands : table relationnelle des emplacements physiques du
-- salon, remplaçant le champ free-text prospects.booth_assignment (P5.x.10).
--
-- Doctrine : Salle Le Nôtre uniquement (Carrousel du Louvre) — ~69 stands
-- pour les 5 pôles MDS Solutions + Paris Radio Show. Les autres salles
-- (Delorme/Gabriel = MediaDays classique, Foyer/Mezzanine/Soufflot = hors
-- scope mediadays.solutions) ne sont PAS commercialisées via cette table.
-- Le schema autorise les 6 salles pour résilience admin (cas exceptionnel
-- où on doit gérer un overflow Foyer côté MDS Solutions).
--
-- 1 stand = 1 prospect max (assignation exclusive). Le prix ne dépend
-- pas du stand — c'est juste de l'allocation physique, la doctrine
-- "pack du prospect = source du prix" reste valide.

create table if not exists public.stands (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  salle text not null check (salle in ('delorme','gabriel','le_notre','foyer','mezzanine','soufflot')),
  taille_m2 numeric(5,1) not null check (taille_m2 > 0),
  pole_recommended text check (pole_recommended in (
    'REGIES_RETAIL_MEDIA','AUDIO_RADIO','DIFFUSION_INFRA','VIDEO_CTV','OUTDOOR_DOOH','DATA_ADTECH'
  )),
  status text not null default 'libre' check (status in ('libre','reserve','paye','bloque')),
  prospect_id uuid references public.prospects(id) on delete set null,
  notes text,
  -- P6.x.3 (à venir) : overlay cliquable sur plan Canva. Positions calibrées
  -- manuellement après import. Optionnel ici.
  position_x numeric(5,2),
  position_y numeric(5,2),
  position_w numeric(5,2),
  position_h numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salle, number),
  -- Contrainte de cohérence : status='libre' ⇒ prospect_id IS NULL.
  -- Autres status ('reserve','paye','bloque') ⇒ prospect_id peut être set
  -- (typiquement set pour reserve/paye, nullable pour 'bloque' = hors-vente).
  constraint chk_libre_means_no_prospect check (
    (status = 'libre' and prospect_id is null) or (status != 'libre')
  )
);

create index if not exists stands_status_idx on public.stands (status);
create index if not exists stands_salle_idx on public.stands (salle);
create index if not exists stands_prospect_id_idx on public.stands (prospect_id);
create index if not exists stands_pole_idx on public.stands (pole_recommended);

comment on table public.stands is
  'P6.x.2a — Catalogue des emplacements physiques du salon (Le Nôtre prioritairement). Remplace le free-text prospects.booth_assignment (P5.x.10) par une vraie relation 1:1 stand-prospect.';

alter table public.stands enable row level security;
create policy "stands_service" on public.stands
  for all to service_role using (true) with check (true);
