#!/usr/bin/env bash
set -euo pipefail

# Liste les items catalogue Sellsy V2.
# Usage :
#   ./scripts/sellsy-list-items.sh              # tous les items
#   ./scripts/sellsy-list-items.sh MDS-ADDON-   # filtre par préfixe SKU
#
# Sortie : SKU<TAB>item_id<TAB>name (un par ligne, triés par SKU)

if [[ ! -f .env.local ]]; then
  echo "Erreur : .env.local introuvable (lancer depuis racine projet)" >&2
  exit 1
fi

CLIENT_ID=$(grep "^SELLSY_CLIENT_ID=" .env.local | cut -d= -f2- | tr -d '"')
CLIENT_SECRET=$(grep "^SELLSY_CLIENT_SECRET=" .env.local | cut -d= -f2- | tr -d '"')

PREFIX="${1:-}"

echo "[1/2] Fetching access token..." >&2
TOKEN=$(curl -s -X POST https://login.sellsy.com/oauth2/access-tokens \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}" \
  | jq -r '.access_token')
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "Erreur : token vide" >&2
  exit 1
fi

echo "[2/2] Fetching items (paginated)..." >&2
OFFSET=0
LIMIT=100
TMP=$(mktemp)

while : ; do
  RESPONSE=$(curl -s -G "https://api.sellsy.com/v2/items" \
    -H "Authorization: Bearer ${TOKEN}" \
    --data-urlencode "limit=${LIMIT}" \
    --data-urlencode "offset=${OFFSET}")

  COUNT=$(echo "$RESPONSE" | jq '.data | length')
  if [[ "$COUNT" -eq 0 ]]; then
    break
  fi

  echo "$RESPONSE" | jq -r '.data[] | [.reference, .id, .name] | @tsv' >> "$TMP"
  OFFSET=$((OFFSET + LIMIT))

  if [[ "$COUNT" -lt "$LIMIT" ]]; then
    break
  fi
done

if [[ -n "$PREFIX" ]]; then
  awk -F'\t' -v p="$PREFIX" '$1 ~ "^"p' "$TMP" | sort
else
  sort "$TMP"
fi

rm -f "$TMP"
