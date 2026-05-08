#!/usr/bin/env bash
set -euo pipefail

# Test manuel Sellsy V2 quirk #24 : enregistrer un paiement et l'attacher
# a une facture (flow en 2 etapes RESTful).
#
# Etape 1 : POST /v2/companies/{COMPANY_ID}/payments       (CreatePayment)
# Etape 2 : POST /v2/invoices/{DOC_ID}/payments/{paymentId} (LinkPayment)
#
# Usage :
#   COMPANY_ID=52457 DOC_ID=52437692 \
#   PAYMENT_METHOD_ID=7 AMOUNT=1980.00 \
#     ./scripts/sellsy-test-payment.sh
#
# Pre-requis : SELLSY_CLIENT_ID + SELLSY_CLIENT_SECRET dans .env.local.

if [[ ! -f .env.local ]]; then
  echo "Erreur : .env.local introuvable (lancer depuis racine projet)" >&2
  exit 1
fi

CLIENT_ID=$(grep "^SELLSY_CLIENT_ID=" .env.local | cut -d= -f2- | tr -d '"')
CLIENT_SECRET=$(grep "^SELLSY_CLIENT_SECRET=" .env.local | cut -d= -f2- | tr -d '"')

: "${COMPANY_ID:?COMPANY_ID requis (Sellsy company id)}"
: "${DOC_ID:?DOC_ID requis (Sellsy invoice/estimate id)}"
: "${PAYMENT_METHOD_ID:?PAYMENT_METHOD_ID requis (id Sellsy du payment method 'Stripe')}"
AMOUNT="${AMOUNT:-1980.00}"
DOC_TYPE="${DOC_TYPE:-invoices}"  # invoices | estimates | deposit-invoices

echo "[1/3] Fetching access token..." >&2
TOKEN=$(curl -s -X POST https://login.sellsy.com/oauth2/access-tokens \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}" \
  | jq -r '.access_token')
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "Erreur : token vide" >&2
  exit 1
fi
echo "Token: ${TOKEN:0:12}..." >&2

PAID_AT=$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")
NUMBER="manual-test-$(date +%s)"

# ----- Etape 1 : creer le paiement sur la company -----
echo
echo "[2/3] POST /v2/companies/${COMPANY_ID}/payments..." >&2
CREATE_PAYLOAD=$(cat <<JSON
{
  "type": "credit",
  "paid_at": "${PAID_AT}",
  "payment_method_id": ${PAYMENT_METHOD_ID},
  "amount": { "value": "${AMOUNT}", "currency": "EUR" },
  "number": "${NUMBER}",
  "note": "Test manuel quirk #24 — Stripe webhook simulation"
}
JSON
)
echo "Create payload:" >&2
echo "$CREATE_PAYLOAD" | jq . >&2

CREATE_RESPONSE=$(curl -sS -X POST "https://api.sellsy.com/v2/companies/${COMPANY_ID}/payments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "$CREATE_PAYLOAD")

echo
echo "Create response:" >&2
echo "$CREATE_RESPONSE" | jq . >&2

PAYMENT_ID=$(echo "$CREATE_RESPONSE" | jq -r '.id // .data.id // empty')
if [[ -z "$PAYMENT_ID" ]]; then
  echo "Erreur : impossible d'extraire payment_id de la response. Stop." >&2
  exit 1
fi

# ----- Etape 2 : attacher au document -----
echo
echo "[3/3] POST /v2/${DOC_TYPE}/${DOC_ID}/payments/${PAYMENT_ID}..." >&2
LINK_PAYLOAD="{ \"amount\": ${AMOUNT} }"
echo "Link payload: $LINK_PAYLOAD" >&2

LINK_RESPONSE=$(curl -sS -X POST "https://api.sellsy.com/v2/${DOC_TYPE}/${DOC_ID}/payments/${PAYMENT_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "$LINK_PAYLOAD")

echo
echo "Link response:" >&2
echo "$LINK_RESPONSE" | jq .

echo
echo "OK : payment_id=${PAYMENT_ID} attache au ${DOC_TYPE}/${DOC_ID}" >&2
