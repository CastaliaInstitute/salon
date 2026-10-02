#!/usr/bin/env bash

set -euo pipefail

MATRIX_SERVER="${MATRIX_SERVER:-https://matrix.castalia.institute}"
DIODATI_ROOM_ID="${DIODATI_ROOM_ID:-}"
DIODATI_STATE_FILE="${DIODATI_STATE_FILE:-public/worlds/villa-diodati/matrix-state.v1.json}"
MATRIX_ACCESS_TOKEN="${MATRIX_ACCESS_TOKEN:-}"
MATRIX_USER="${MATRIX_USER:-}"
MATRIX_PASSWORD="${MATRIX_PASSWORD:-}"

if [[ -z "$DIODATI_ROOM_ID" ]]; then echo "DIODATI_ROOM_ID is required" >&2; exit 1; fi
if [[ ! -r "$DIODATI_STATE_FILE" ]]; then echo "State file is not readable: $DIODATI_STATE_FILE" >&2; exit 1; fi

if jq -e '.. | numbers | select(. != floor)' "$DIODATI_STATE_FILE" >/dev/null; then
  echo "State file contains floating-point numbers; Matrix salon state requires integer grid coordinates." >&2
  exit 1
fi

if [[ -z "$MATRIX_ACCESS_TOKEN" ]]; then
  if [[ -z "$MATRIX_USER" || -z "$MATRIX_PASSWORD" ]]; then
    echo "Set MATRIX_ACCESS_TOKEN or both MATRIX_USER and MATRIX_PASSWORD" >&2
    exit 1
  fi
  MATRIX_ACCESS_TOKEN="$(jq -nc --arg user "$MATRIX_USER" --arg password "$MATRIX_PASSWORD" \
    '{type:"m.login.password",identifier:{type:"m.id.user",user:$user},password:$password}' | \
    curl -fsS -X POST "${MATRIX_SERVER}/_matrix/client/v3/login" \
      -H 'Content-Type: application/json' --data-binary @- | jq -er '.access_token')"
fi

room="$(jq -nr --arg value "$DIODATI_ROOM_ID" '$value|@uri')"
payload="$(jq -c 'del(.updatedAt) | .updatedAt = (now | strflocaltime("%Y-%m-%dT%H:%M:%SZ"))' "$DIODATI_STATE_FILE")"
curl -fsS -X PUT "${MATRIX_SERVER}/_matrix/client/v3/rooms/${room}/state/org.castalia.salon.room/" \
  -H "Authorization: Bearer ${MATRIX_ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data-binary "$payload" >/dev/null
echo "Published org.castalia.salon.room to ${DIODATI_ROOM_ID}"
