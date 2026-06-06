# Migrations Supabase

Schéma applicatif PostgreSQL versionné. Nommage `YYYYMMDDhhmmss_NNNN_short_description.sql`.

## Application en prod

```bash
pnpm db:push        # applique les migrations en attente sur le projet linké
pnpm db:types       # régénère src/lib/supabase/database.types.ts
```

## Gaps numérotation connus

| Numéro | État           | Note                                                                                                                                                                                                                                                                                                                                                       |
| ------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0074` | **Inexistant** | Gap intentionnel — artefact d'un commit annulé pendant P11.x.Rebrand (un brouillon de migration `0074_rebrand_*` était préparé puis abandonné car les renommages DB ont été repoussés à V2, voir [[feedback_rebrand_exposant_to_partenaire]]). La séquence saute donc `0073` → `0075`. **Ne pas renuméroter** : `0075`–`0077` sont déjà appliqués en prod. |
| `0079` | **Inexistant** | Gap réservé pour un sous-brief P5.x.ConnectOnAirCache qui n'a pas été matérialisé. La séquence saute `0078` → `0080`. **Ne pas renuméroter**.                                                                                                                                                                                                              |

## Notes historiques

### Migration 0078 — oubli UNIQUE constraint (fixé par migration 0081)

La migration 0078 (V1 ConnectOnAir sociétés) a ajouté 23 colonnes additives sur `connectonair_directory` mais a oublié la `UNIQUE` constraint sur `source_societe_id` nécessaire pour le `ON CONFLICT` du script `import-connectonair-export.ts`. L'index partiel `uniq_coa_directory_source_societe_id` créé en 0078 ne sert PAS de cible `ON CONFLICT` (PostgreSQL exige une vraie contrainte ou un index UNIQUE complet sans `WHERE`).

**Action manuelle prod (2026-06-06)** : Phil a appliqué via Supabase SQL Editor :

```sql
ALTER TABLE public.connectonair_directory
  ADD CONSTRAINT connectonair_directory_source_societe_id_unique
  UNIQUE (source_societe_id);
```

**Migration 0081** matérialise le fix dans le code de manière idempotente (`DROP CONSTRAINT IF EXISTS` puis `ADD CONSTRAINT`) :

- En prod : no-op net (la constraint existe déjà).
- En local (dev qui clone + `pnpm db:push`) : crée la constraint.

## Doctrines

- **RLS systématique** ([[feedback_rls_systematic]]) : toute nouvelle table doit `enable row level security` + au moins une policy `service_role_all_*`.
- **GRANT explicites** ([[reference_supabase_data_api_grants]]) : Data API expose les tables uniquement via `service_role`, jamais `anon`/`authenticated` (sauf cas explicite). Sans `GRANT`, la table n'apparaît pas dans la Data API même si RLS est OK.
- **Idempotence** : préférer `create table if not exists`, `alter table ... add column if not exists`, `drop policy if exists` avant `create policy`. Permet de re-run la migration sur un environnement où elle a déjà tourné partiellement (debug, branches, dev).
- **Atomicité backfill** : pour un remap d'enum/CHECK, utiliser `UPDATE ... SET col = CASE col WHEN ... END WHERE col IN (...)` plutôt que plusieurs `UPDATE` séquentiels (cf. `0077_signup_category_partenaire_sponsor.sql`).
