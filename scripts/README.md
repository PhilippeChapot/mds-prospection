# Scripts d'enrichissement / import

Scripts CLI one-shot pour enrichir la base depuis des sources externes
(ConnectOnAir cache, fichiers XLSX curated, etc.). Tous safe à
re-exécuter (idempotents).

## Convention `data/imports/`

Les fichiers XLSX/CSV externes (copies de Google Drive Phil notamment)
vivent dans `data/imports/`. **Ce dossier est gitignored** — ne jamais
committer ces fichiers (PII + sources propriétaires).

```bash
mkdir -p data/imports
cp "/path/to/file.xlsx" data/imports/
```

## Scripts disponibles

### `enrich-phones-from-coa.ts`

Enrichit `companies.phone` + `contacts.phone_mobile` depuis le cache
ConnectOnAir local (tables `connectonair_directory` + `_contacts`,
import livré par P5.x.ConnectOnAirDirectoryCache).

```bash
pnpm tsx scripts/enrich-phones-from-coa.ts --dry-run   # rapport stats
pnpm tsx scripts/enrich-phones-from-coa.ts             # apply
```

Matching :

- Companies : `normalizeNameJs(name)` match strict sur `connectonair_directory.normalized_name`.
- Contacts : email LOWER+TRIM match strict sur `connectonair_directory_contacts.email_normalized`.

### `enrich-phones-from-prospection-xlsx.ts` (P5.x.PhoneEnrichmentDisplay-bis)

Enrichit phones depuis `Prospection_MDS2026_v2.xlsx` (fichier curated
Phil sur Google Drive). Source complémentaire au script CoA.

```bash
# 1. Copier le fichier dans data/imports/ (gitignored)
cp "/Users/.../MEDIADAYS/MD PROSPECTION/Prospection_MDS2026_v2.xlsx" \
   data/imports/

# 2. Dry-run pour voir les stats
pnpm tsx scripts/enrich-phones-from-prospection-xlsx.ts --dry-run

# 3. Apply
pnpm tsx scripts/enrich-phones-from-prospection-xlsx.ts

# Optionnel : path xlsx custom
pnpm tsx scripts/enrich-phones-from-prospection-xlsx.ts --file /path/to/other.xlsx
```

Matching :

- Companies : domain (depuis URL ou email générique) en priorité, fallback `normalizeNameJs(name)`.
- Contacts : email LOWER+TRIM.

Source tag DB : `companies.phone_source = 'prospection_xlsx_v2'` /
`contacts.phone_mobile_source = 'prospection_xlsx_v2'`.

## Ordre d'exécution recommandé pour phones

1. ConnectOnAir (source spécialisée audio/radio, priorité conceptuelle) :
   ```bash
   pnpm tsx scripts/enrich-phones-from-coa.ts
   ```
2. Prospection xlsx (curated Phil, comble les trous) :
   ```bash
   pnpm tsx scripts/enrich-phones-from-prospection-xlsx.ts
   ```

Les 2 scripts respectent `WHERE phone IS NULL` → idempotents +
re-exécutables sans risque d'écraser un phone déjà posé.

## Variables env requises

Dans `.env.local` :

```
SUPABASE_URL=https://....supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Le service_role bypass RLS — ces scripts sont admin-only par construction.
