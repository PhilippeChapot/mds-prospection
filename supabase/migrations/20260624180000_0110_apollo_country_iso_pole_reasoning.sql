-- P5.x.ApolloEnrichFixes
--
-- Partie 1 — Backfill country : Apollo stockait le nom complet ("France") au
-- lieu de l'ISO 2 ("FR"), ce qui casse la sauvegarde (CHECK length<=2). On
-- normalise les valeurs > 2 caractères les plus fréquentes.
UPDATE public.companies
SET country = CASE
  WHEN country ILIKE 'France' THEN 'FR'
  WHEN country ILIKE 'United States' OR country ILIKE 'USA' OR country ILIKE 'United States of America' THEN 'US'
  WHEN country ILIKE 'United Kingdom' OR country ILIKE 'UK' OR country ILIKE 'Great Britain' THEN 'GB'
  WHEN country ILIKE 'Germany' OR country ILIKE 'Deutschland' THEN 'DE'
  WHEN country ILIKE 'Spain' OR country ILIKE 'España' THEN 'ES'
  WHEN country ILIKE 'Italy' OR country ILIKE 'Italia' THEN 'IT'
  WHEN country ILIKE 'Belgium' OR country ILIKE 'Belgique' THEN 'BE'
  WHEN country ILIKE 'Switzerland' OR country ILIKE 'Suisse' THEN 'CH'
  WHEN country ILIKE 'Netherlands' OR country ILIKE 'Pays-Bas' THEN 'NL'
  WHEN country ILIKE 'Canada' THEN 'CA'
  WHEN country ILIKE 'Portugal' THEN 'PT'
  WHEN country ILIKE 'Ireland' OR country ILIKE 'Irlande' THEN 'IE'
  WHEN country ILIKE 'Luxembourg' THEN 'LU'
  WHEN country ILIKE 'Austria' OR country ILIKE 'Autriche' THEN 'AT'
  WHEN country ILIKE 'Sweden' THEN 'SE'
  WHEN country ILIKE 'Denmark' THEN 'DK'
  WHEN country ILIKE 'Norway' THEN 'NO'
  WHEN country ILIKE 'Finland' THEN 'FI'
  WHEN country ILIKE 'Poland' OR country ILIKE 'Pologne' THEN 'PL'
  WHEN country ILIKE 'United Arab Emirates' THEN 'AE'
  ELSE NULL -- nom complet non mappé → on vide plutôt que de garder un libellé invalide
END
WHERE country IS NOT NULL AND length(country) > 2;

-- Partie 2 — Raisonnement de la classification IA (pole_confidence +
-- pole_classified_by existent déjà ; il manquait la phrase explicative).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pole_reasoning TEXT;

COMMENT ON COLUMN public.companies.pole_reasoning IS
  'P5.x — phrase explicative de la classification pôle par IA (Haiku) via données Apollo.';

-- Partie 3 — colonnes Apollo (apollo_raw_data / apollo_enriched_at /
-- apollo_organization_id) déjà présentes depuis les migrations 0060/0061.
-- Rien à ajouter.
