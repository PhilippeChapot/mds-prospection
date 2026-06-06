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

## Doctrines

- **RLS systématique** ([[feedback_rls_systematic]]) : toute nouvelle table doit `enable row level security` + au moins une policy `service_role_all_*`.
- **GRANT explicites** ([[reference_supabase_data_api_grants]]) : Data API expose les tables uniquement via `service_role`, jamais `anon`/`authenticated` (sauf cas explicite). Sans `GRANT`, la table n'apparaît pas dans la Data API même si RLS est OK.
- **Idempotence** : préférer `create table if not exists`, `alter table ... add column if not exists`, `drop policy if exists` avant `create policy`. Permet de re-run la migration sur un environnement où elle a déjà tourné partiellement (debug, branches, dev).
- **Atomicité backfill** : pour un remap d'enum/CHECK, utiliser `UPDATE ... SET col = CASE col WHEN ... END WHERE col IN (...)` plutôt que plusieurs `UPDATE` séquentiels (cf. `0077_signup_category_partenaire_sponsor.sql`).
