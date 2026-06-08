-- Migration 0086 — P14.3-bis.NotesLegacyMerge
--
-- Migre le contenu legacy `prospects.notes` (text field plat, populate
-- via l ancien <NotesEditor>) vers la table `prospect_notes` (P14.3) :
-- chaque note legacy devient une seule entree initiale dans la timeline,
-- avec :
--   - author_user_id = NULL (note systeme = historique migre)
--   - contact_id = NULL (pas d info historique)
--   - content = trim(prospects.notes)
--   - created_at = prospects.created_at (preserve l ordre chronologique)
--
-- IDEMPOTENT : si la migration est re-jouee, on n insere PAS de doublon
-- grace au WHERE NOT EXISTS (match sur prospect_id + author IS NULL +
-- content). Permet aussi de rejouer si Phil ajoute de nouvelles notes
-- legacy via direct SQL apres coup (peu probable mais defensif).
--
-- PAS DE DROP COLUMN dans cette PR : on garde `prospects.notes`
-- intact pour validation visuelle. Migration 0087 future fera le DROP
-- apres confirmation Phil que la timeline affiche bien les notes
-- historiques sur quelques prospects pilotes.

do $$
declare
  legacy_count integer;
  inserted_count integer;
begin
  -- ─── Phase 1 : audit pre-migration ───
  select count(*) into legacy_count
  from public.prospects
  where notes is not null
    and length(trim(notes)) > 0;

  raise notice 'P14.3-bis audit : % prospects ont une note legacy non-vide', legacy_count;

  -- ─── Phase 2 : INSERT idempotent ───
  with inserted as (
    insert into public.prospect_notes (
      prospect_id,
      author_user_id,
      contact_id,
      content,
      created_at,
      updated_at
    )
    select
      p.id,
      null::uuid,
      null::uuid,
      trim(p.notes),
      p.created_at,
      now()
    from public.prospects p
    where p.notes is not null
      and length(trim(p.notes)) > 0
      and not exists (
        select 1
        from public.prospect_notes pn
        where pn.prospect_id = p.id
          and pn.author_user_id is null
          and pn.content = trim(p.notes)
      )
    returning id
  )
  select count(*) into inserted_count from inserted;

  raise notice 'P14.3-bis : % entrees inserees dans prospect_notes', inserted_count;
end $$;
