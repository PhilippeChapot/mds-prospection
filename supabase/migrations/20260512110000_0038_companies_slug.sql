-- Migration 0038 — P5.x.16-bis
-- Slug court nominatif unique pour URLs publiques d'invitation visiteurs.
--
-- Avant : mediadays.solutions/i/71eb7b48-cb95-4973-9205-5b50bdcc33e1 (UUID,
-- illisible, impossible a dicter). Apres : mediadays.solutions/i/21-juin-
-- production (slugify(name), 3-32 chars).
--
-- Le slug est auto-genere depuis name au backfill, modifiable par l'expo-
-- sant via Espace Exposant (server action updateCompanySlugAction). L'unicite
-- est garantie par index unique partiel (autorise NULL pour les futurs
-- inserts qui n'ont pas encore de slug).
--
-- L'ancienne route /i/[id] continue d'accepter les UUIDs en fallback
-- (retrocompat liens deja envoyes pendant les tests P5.x.16).

-- Extension unaccent pour le slugify SQL (souvent deja installee sur Supabase).
create extension if not exists unaccent;

alter table public.companies
  add column if not exists slug text;

comment on column public.companies.slug is
  'P5.x.16-bis — Slug court nominatif unique pour URLs publiques (mediadays.solutions/i/<slug>). Auto-genere depuis name au backfill, modifiable par l''exposant via Espace Exposant.';

-- Index unique partiel : on autorise NULL pour les futurs inserts sans
-- slug initial (le backfill garantit qu'il n'y a aucun NULL aujourd'hui,
-- mais on prefere ne pas contraindre les server actions futures).
create unique index if not exists companies_slug_unique_idx
  on public.companies (slug)
  where slug is not null;

-- Backfill : genere un slug pour toutes les companies existantes a partir
-- de leur name. Strategie :
--   1. lower + unaccent + remplacement non-alphanum par tiret + trim tirets
--   2. tronque a 32 chars
--   3. si vide (nom uniquement caracteres speciaux), fallback "co-<id8>"
--   4. en cas de collision, append "-2", "-3", etc. en tronquant la base a 30 chars
do $$
declare
  c record;
  candidate text;
  base text;
  counter integer;
begin
  for c in
    select id, name
    from public.companies
    where slug is null
    order by created_at
  loop
    -- Slugify de base.
    candidate := lower(unaccent(c.name));
    candidate := regexp_replace(candidate, '[^a-z0-9]+', '-', 'g');
    candidate := regexp_replace(candidate, '^-+|-+$', '', 'g');
    candidate := substring(candidate from 1 for 32);

    if candidate = '' then
      candidate := 'co-' || substring(c.id::text from 1 for 8);
    end if;

    -- Gestion collisions.
    base := candidate;
    counter := 1;
    while exists (
      select 1 from public.companies where slug = candidate and id <> c.id
    ) loop
      counter := counter + 1;
      candidate := substring(base from 1 for 30) || '-' || counter;
    end loop;

    update public.companies set slug = candidate where id = c.id;
  end loop;
end$$;
