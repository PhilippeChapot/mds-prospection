#!/usr/bin/env bash
set -euo pipefail

# Liste les taxes (taux de TVA) configurees dans Sellsy V2.
# Utile pour identifier l'id Sellsy du taux 0% autoliquidation
# (SELLSY_TAX_ID_0_PERCENT a configurer en env Vercel pour P4 M7).
#
# Usage :
#   ./scripts/sellsy-list-taxes.sh           # toutes les taxes
#   ./scripts/sellsy-list-taxes.sh zero      # filtre rate=0 (autoliquidation)
#
# Sortie : id<TAB>label<TAB>rate<TAB>category<TAB>vatex (un par ligne, triees par id)

if [[ ! -f .env.local ]]; then
  echo "Erreur : .env.local introuvable (lancer depuis racine projet)" >&2
  exit 1
fi

CLIENT_ID=$(grep "^SELLSY_CLIENT_ID=" .env.local | cut -d= -f2- | tr -d '"')
CLIENT_SECRET=$(grep "^SELLSY_CLIENT_SECRET=" .env.local | cut -d= -f2- | tr -d '"')

FILTER="${1:-}"

echo "[1/2] Fetching access token..." >&2
TOKEN=$(curl -s -X POST https://login.sellsy.com/oauth2/access-tokens \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}" \
  | jq -r '.access_token')
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "Erreur : token vide" >&2
  exit 1
fi

echo "[2/2] Fetching /v2/taxes (paginated)..." >&2
OFFSET=0
LIMIT=100
TMP=$(mktemp)

while : ; do
  RESPONSE=$(curl -s -G "https://api.sellsy.com/v2/taxes" \
    -H "Authorization: Bearer ${TOKEN}" \
    --data-urlencode "limit=${LIMIT}" \
    --data-urlencode "offset=${OFFSET}")

  COUNT=$(echo "$RESPONSE" | jq '.data | length')
  if [[ "$COUNT" -eq 0 ]]; then
    break
  fi

  # TSV : id\tlabel\trate\tcategory\tvatex (vatex peut etre null/empty)
  echo "$RESPONSE" | jq -r '.data[] | [.id, .label, .rate, (.category // ""), (.vatex // "")] | @tsv' >> "$TMP"
  OFFSET=$((OFFSET + LIMIT))

  if [[ "$COUNT" -lt "$LIMIT" ]]; then
    break
  fi
done

# Header en stderr pour ne pas polluer le TSV pipeable
echo -e "ID\tLABEL\tRATE\tCATEGORY\tVATEX" >&2
echo -e "--\t-----\t----\t--------\t-----" >&2

if [[ "$FILTER" == "zero" ]]; then
  # rate=0 only (col 3), trie par id
  awk -F'\t' '$3 == 0 || $3 == "0"' "$TMP" | sort -n -t$'\t' -k1
else
  sort -n -t$'\t' -k1 "$TMP"
fi

rm -f "$TMP"
