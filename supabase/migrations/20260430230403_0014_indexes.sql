-- Migration 0014 — Indexes pg_trgm pour auto-complete fuzzy
-- Les indexes B-tree FK / partiels sont deja crees en meme temps que leurs tables.

-- companies.name + name_normalized : auto-complete societe (SPEC §3.7)
create index companies_name_trgm_idx on public.companies using gin (name extensions.gin_trgm_ops);
create index companies_name_normalized_trgm_idx on public.companies using gin (name_normalized extensions.gin_trgm_ops);

-- affiliates.display_name_normalized : auto-complete affilie (SPEC §3.13)
create index affiliates_display_name_trgm_idx on public.affiliates using gin (display_name_normalized extensions.gin_trgm_ops);

-- prs_2026_exhibitors.company_name_normalized : matching fuzzy "2 lettres pres"
create index prs_exhibitors_name_trgm_idx on public.prs_2026_exhibitors using gin (company_name_normalized extensions.gin_trgm_ops);
