#!/usr/bin/env bash
# Test manuel POST /estimates Sellsy V2 — valide la shape du payload AVANT
# de relancer le live-test du workflow post-conversion (cf. quirk #8 :
# pas de /documents generique en V2, il faut /estimates).
#
# Usage :
#   1. Definir SELLSY_CLIENT_ID + SELLSY_CLIENT_SECRET dans l'env (ou .env.local).
#   2. Adapter COMPANY_ID + ITEM_ID ci-dessous (companyId Sellsy existant
#      + un sellsy_item_id MDS deja mappe).
#   3. ./scripts/sellsy-test-estimate.sh
#
# Output attendu :
#   - 1 access_token recupere
#   - 1 estimate cree, response avec id du devis
#   - en cas de 400, body complet pour debug (pas de [Object])

set -euo pipefail

if [ -f .env.local ]; then
  set -a
  # shellcheck source=/dev/null
  . .env.local
  set +a
fi

: "${SELLSY_CLIENT_ID:?SELLSY_CLIENT_ID manquant}"
: "${SELLSY_CLIENT_SECRET:?SELLSY_CLIENT_SECRET manquant}"

# A adapter avant exec.
COMPANY_ID="${COMPANY_ID:-52457}"   # ex: 21 Juin Production
ITEM_ID="${ITEM_ID:-1234567}"        # ex: 1 sellsy_item_id MDS-PACK-...

echo "[1/2] Fetching access token..."
TOKEN=$(curl -sS -X POST https://login.sellsy.com/oauth2/access-tokens \
  -H 'content-type: application/json' \
  -d "{
    \"grant_type\":\"client_credentials\",
    \"client_id\":\"$SELLSY_CLIENT_ID\",
    \"client_secret\":\"$SELLSY_CLIENT_SECRET\",
    \"scope\":\"all\"
  }" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: failed to fetch token"
  exit 1
fi
echo "Token: ${TOKEN:0:12}..."

echo
echo "[2/2] POST /v2/estimates with minimal payload..."
PAYLOAD=$(cat <<JSON
{
  "related": [{ "type": "company", "id": $COMPANY_ID }],
  "rows": [
    {
      "type": "catalog",
      "quantity": "1",
      "unit_amount": "1980.00",
      "related": {
        "id": $ITEM_ID,
        "type": "product"
      }
    }
  ]
}
JSON
)

echo "Payload:"
echo "$PAYLOAD" | jq .

echo
echo "Response:"
curl -sS -X POST https://api.sellsy.com/v2/estimates \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json' \
  -d "$PAYLOAD" | jq .

# Notes :
# - Si Sellsy renvoie 400 "le champ items est manquant" -> tester "lines" a la place.
# - Si "type" exige (au lieu d'etre dans l'URL) -> ajouter "type": "estimate" au body.
# - Si "rate" exige sur chaque item -> ajouter "rate": 20 (TVA 20%).
