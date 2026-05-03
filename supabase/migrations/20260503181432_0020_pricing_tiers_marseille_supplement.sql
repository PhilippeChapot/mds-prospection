-- ============================================================================
-- 0020 — P3 M3 finitions : ajout colonne marseille_supplement_eur_ht
--                          sur pricing_tiers + seed des 6 valeurs metier.
--
-- Realite business : Paris Radio Show (15 dec, Carrousel du Louvre) est le
-- salon principal et est INCLUS dans tous les packs. La journee MediaDays
-- Marseille (10 dec, Palais du Pharo) est OPTIONNELLE, avec un supplement
-- HT qui depend du pack choisi ET de la categorie tarifaire.
--
-- Marseille n'a pas de stand a attribuer (juste presentation + dejeuner +
-- networking) — distinct de Paris ou l'exposant choisit un emplacement.
--
-- Valeurs HT fournies par Phil :
--   prs_exhibitor (Cas A) : ACCESS 2450, CLASSIC 2450, PREMIUM 1450
--   standard      (Cas B) : ACCESS 5000, CLASSIC 5000, PREMIUM 4250
--
-- En cas de pricing_tier non seede pour un (pack, category), l'UPDATE est
-- silencieusement ignore -> la valeur reste null -> cote app on traite
-- comme "supplement non disponible" (Marseille indisponible pour ce pack).
-- ============================================================================

alter table public.pricing_tiers
  add column if not exists marseille_supplement_eur_ht numeric(12,2);

comment on column public.pricing_tiers.marseille_supplement_eur_ht is
  'Supplement HT pour ajouter la journee MDS Marseille (10 dec) au pack PRS. '
  'Null = Marseille non disponible pour ce (pack, category).';

-- Cas A — exposants PRS confirmes
update public.pricing_tiers
  set marseille_supplement_eur_ht = 2450
  where pack_code = 'ACCESS' and category = 'prs_exhibitor';

update public.pricing_tiers
  set marseille_supplement_eur_ht = 2450
  where pack_code = 'CLASSIC' and category = 'prs_exhibitor';

update public.pricing_tiers
  set marseille_supplement_eur_ht = 1450
  where pack_code = 'PREMIUM' and category = 'prs_exhibitor';

-- Cas B — standard (non PRS, conserve pour quand un partenaire passera par
-- le wizard Cas A indirectement, P5+)
update public.pricing_tiers
  set marseille_supplement_eur_ht = 5000
  where pack_code = 'ACCESS' and category = 'standard';

update public.pricing_tiers
  set marseille_supplement_eur_ht = 5000
  where pack_code = 'CLASSIC' and category = 'standard';

update public.pricing_tiers
  set marseille_supplement_eur_ht = 4250
  where pack_code = 'PREMIUM' and category = 'standard';
