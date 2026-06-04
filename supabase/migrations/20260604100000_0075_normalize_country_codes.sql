-- Migration 0075 — P5.x.MatchingFix : normalise companies.country vers ISO 3166-1 alpha-2.
--
-- Phase 0 audit (2026-06-04) : 287 FR (ISO) + 11 "France" (texte plein) +
-- autres incoherences. Convention figee = ISO 2 lettres.
--
-- Helper applicatif src/lib/format/country.ts gere les aliases au futur
-- (FRANCE / Belgique / Allemagne / etc.). Cette migration backfill juste
-- les valeurs existantes en DB.

update public.companies set country = 'FR' where upper(country) in ('FRANCE', 'FR.', 'REPUBLIQUE FRANCAISE');
update public.companies set country = 'GB' where upper(country) in ('UNITED KINGDOM', 'UK', 'ROYAUME-UNI', 'GREAT BRITAIN', 'ENGLAND');
update public.companies set country = 'BE' where upper(country) in ('BELGIUM', 'BELGIQUE', 'BELGIE');
update public.companies set country = 'DE' where upper(country) in ('GERMANY', 'ALLEMAGNE', 'DEUTSCHLAND');
update public.companies set country = 'NL' where upper(country) in ('NETHERLANDS', 'PAYS-BAS', 'NEDERLAND', 'HOLLAND');
update public.companies set country = 'ES' where upper(country) in ('SPAIN', 'ESPAGNE', 'ESPANA');
update public.companies set country = 'IT' where upper(country) in ('ITALY', 'ITALIE', 'ITALIA');
update public.companies set country = 'CH' where upper(country) in ('SWITZERLAND', 'SUISSE', 'SCHWEIZ', 'SVIZZERA');
update public.companies set country = 'US' where upper(country) in ('UNITED STATES', 'USA', 'ETATS-UNIS', 'UNITED STATES OF AMERICA');
update public.companies set country = 'CA' where upper(country) in ('CANADA');
update public.companies set country = 'AT' where upper(country) in ('AUSTRIA', 'AUTRICHE');
update public.companies set country = 'SE' where upper(country) in ('SWEDEN', 'SUEDE');
update public.companies set country = 'DK' where upper(country) in ('DENMARK', 'DANEMARK');
update public.companies set country = 'NO' where upper(country) in ('NORWAY', 'NORVEGE');
update public.companies set country = 'FI' where upper(country) in ('FINLAND', 'FINLANDE');
update public.companies set country = 'PT' where upper(country) in ('PORTUGAL');
update public.companies set country = 'IE' where upper(country) in ('IRELAND', 'IRLANDE');
update public.companies set country = 'PL' where upper(country) in ('POLAND', 'POLOGNE');
update public.companies set country = 'AU' where upper(country) in ('AUSTRALIA', 'AUSTRALIE');
update public.companies set country = 'BR' where upper(country) in ('BRAZIL', 'BRESIL');
update public.companies set country = 'CN' where upper(country) in ('CHINA', 'CHINE');
update public.companies set country = 'JP' where upper(country) in ('JAPAN', 'JAPON');

-- Upper-case les valeurs deja en 2 lettres (defense en profondeur).
update public.companies set country = upper(country) where country is not null and char_length(country) = 2;
