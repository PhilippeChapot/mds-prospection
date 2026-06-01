-- Migration 0070 — P6.x.1a-quinquies : CHECK constraint sur reference MDS-*.
--
-- Phil utilise le meme compte Sellsy pour plusieurs business (MDS,
-- Editions HF Brive, RadioHouse, La Lettre Pro). Tous les produits MDS
-- ont une reference prefixee 'MDS-' par convention.
--
-- La sync syncSellsyProducts() filtre deja via isMdsReference (case-
-- insensitive) cote code. Cette contrainte DB est une defense in depth :
-- elle empeche un INSERT manuel ou une migration accidentelle d injecter
-- une row non-MDS dans le miroir.
--
-- Audit pre-applique (2026-06-01, before commit) : 36 rows, 36 MDS,
-- 0 non-MDS — safe d ajouter le CHECK sans cleanup prealable.
--
-- Le pattern accepte 'MDS-' / 'mds-' / 'Mds-' (case-insensitive via
-- UPPER). Les references NULL sont aussi acceptees (fallback unknown-id
-- de la sync en cas de produit Sellsy mal forme).

alter table public.sellsy_products_mirror
  drop constraint if exists chk_sellsy_products_mds_prefix;

alter table public.sellsy_products_mirror
  add constraint chk_sellsy_products_mds_prefix
  check (reference is null or upper(reference) like 'MDS-%');

comment on constraint chk_sellsy_products_mds_prefix on public.sellsy_products_mirror is
  'P6.x.1a-quinquies - garde defensif multi-business Sellsy : reference doit commencer par MDS-.';
