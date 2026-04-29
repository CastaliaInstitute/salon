#!/usr/bin/env bash
# Create or update Cloudflare CNAME: salon.castalia.institute → GitHub Pages (castaliainstitute.github.io)
#
# Prerequisites:
#   - CLOUDFLARE_API_TOKEN with Zone → DNS → Edit (and Zone → Zone → Read to resolve zone id)
#   - curl, jq
#
# Usage:
#   export CLOUDFLARE_API_TOKEN=...
#   ./scripts/cloudflare-salon-cname.sh
#
# Optional:
#   export CF_ZONE_ID=...   # skip zone lookup if you already know it

set -euo pipefail

TARGET='castaliainstitute.github.io'
RECORD_NAME='salon'

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Set CLOUDFLARE_API_TOKEN (Zone DNS Edit)." >&2
  exit 1
fi

if [[ -z "${CF_ZONE_ID:-}" ]]; then
  CF_ZONE_ID="$(curl -sS -X GET 'https://api.cloudflare.com/client/v4/zones?name=castalia.institute' \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H 'Content-Type: application/json' | jq -r '.result[0].id // empty')"
fi

if [[ -z "${CF_ZONE_ID}" || "${CF_ZONE_ID}" == 'null' ]]; then
  echo "Could not resolve zone id for castalia.institute. Set CF_ZONE_ID or fix token permissions." >&2
  exit 1
fi

EXISTING="$(curl -sS -G "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
  --data-urlencode "name=salon.castalia.institute" \
  --data-urlencode "type=CNAME" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H 'Content-Type: application/json')"

RID="$(echo "${EXISTING}" | jq -r '.result[0].id // empty')"

PAYLOAD="$(jq -nc \
  --arg name "${RECORD_NAME}" \
  --arg content "${TARGET}" \
  '{type:"CNAME", name:$name, content:$content, ttl:1, proxied:false}')"

if [[ -n "${RID}" ]]; then
  echo "Updating DNS record ${RID}..."
  curl -sS -X PUT "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${RID}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "${PAYLOAD}" | jq .
else
  echo "Creating CNAME ${RECORD_NAME} → ${TARGET}..."
  curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "${PAYLOAD}" | jq .
fi

echo "Done. In GitHub: repo Settings → Pages → Custom domain: salon.castalia.institute (or run gh api PUT ...)."
