#!/usr/bin/env bash
# Fetch un devis Sellsy V2 existant avec embed des rows.
#
# Sert a inspecter la shape exacte d'un row tel que Sellsy V2 le retourne,
# pour calquer le payload de creation dessus (POST /estimates).
#
# Usage :
#   ESTIMATE_ID=<id> ./scripts/sellsy-get-estimate.sh
#
# Pre-requis : SELLSY_CLIENT_ID + SELLSY_CLIENT_SECRET dans l'env ou .env.local.

set -euo pipefail

if [ -f .env.local ]; then
  set -a
  # shellcheck source=/dev/null
  . .env.local
  set +a
fi

: "${SELLSY_CLIENT_ID:?SELLSY_CLIENT_ID manquant}"
: "${SELLSY_CLIENT_SECRET:?SELLSY_CLIENT_SECRET manquant}"
: "${ESTIMATE_ID:?ESTIMATE_ID manquant — usage : ESTIMATE_ID=<id> $0}"

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
echo "[2/2] GET /v2/estimates/$ESTIMATE_ID ..."
curl -sS "https://api.sellsy.com/v2/estimates/$ESTIMATE_ID" \
  -H "authorization: Bearer $TOKEN" \
  -H 'accept: application/json' | jq .
