-- ============================================================================
-- 0018 — P2 M1 : ajout colonne notes sur public.companies
--
-- Le brief P2 demande une section "Notes societe" sur la fiche
-- /admin/companies/[id], avec edition inline. La colonne n'existait
-- pas en P0 (les notes etaient sur prospects uniquement).
-- ============================================================================

alter table public.companies
  add column if not exists notes text;

comment on column public.companies.notes is
  'Notes libres admin/sales sur la societe (P2). Edition inline sur la fiche.';
