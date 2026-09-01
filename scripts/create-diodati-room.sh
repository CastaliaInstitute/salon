#!/usr/bin/env bash

set -euo pipefail

MATRIX_BASE_URL="${MATRIX_BASE_URL:-http://localhost:8008}"
MATRIX_DOMAIN="${MATRIX_DOMAIN:-matrix.castalia.institute}"
MATRIX_CREDENTIALS_FILE="${MATRIX_CREDENTIALS_FILE:-/opt/matrix/diodati-accounts.env}"
ROOM_ALIAS="#villa-diodati:${MATRIX_DOMAIN}"

if [[ ! -r "$MATRIX_CREDENTIALS_FILE" ]]; then
  echo "Credentials file is not readable: $MATRIX_CREDENTIALS_FILE" >&2
  exit 1
fi

password_for() {
  local localpart="$1"
  awk -F= -v name="$localpart" '$1 == name { print substr($0, index($0, "=") + 1); exit }' "$MATRIX_CREDENTIALS_FILE"
}

login() {
  local localpart="$1"
  local password
  password="$(password_for "$localpart")"
  if [[ -z "$password" ]]; then
    echo "No password found for $localpart" >&2
    return 1
  fi

  jq -nc --arg user "$localpart" --arg password "$password" \
    '{type:"m.login.password",identifier:{type:"m.id.user",user:$user},password:$password}' |
    curl -fsS -X POST "${MATRIX_BASE_URL}/_matrix/client/v3/login" \
      -H 'Content-Type: application/json' --data-binary @- |
    jq -er '.access_token'
}

encoded_alias="$(jq -nr --arg value "$ROOM_ALIAS" '$value|@uri')"
room_id="$(curl -fsS "${MATRIX_BASE_URL}/_matrix/client/v3/directory/room/${encoded_alias}" 2>/dev/null | jq -r '.room_id // empty' || true)"
byron_token="$(login 'a.byron')"

if [[ -z "$room_id" ]]; then
  create_payload="$(jq -nc --arg alias 'villa-diodati' --arg domain "$MATRIX_DOMAIN" '{
    room_alias_name: $alias,
    visibility: "public",
    preset: "public_chat",
    name: "Villa Diodati",
    topic: "A storm-bound salon at Lake Geneva with Lord Byron, Mary Godwin, Claire Clairmont, Percy Shelley, and John Polidori.",
    invite: [
      ("@a.maryshelley:" + $domain),
      ("@a.clairmont:" + $domain),
      ("@a.shelley:" + $domain),
      ("@a.polidori:" + $domain)
    ],
    initial_state: [
      {type:"m.room.history_visibility", state_key:"", content:{history_visibility:"world_readable"}},
      {type:"m.room.guest_access", state_key:"", content:{guest_access:"can_join"}}
    ]
  }')"

  room_id="$(curl -fsS -X POST "${MATRIX_BASE_URL}/_matrix/client/v3/createRoom" \
    -H "Authorization: Bearer ${byron_token}" \
    -H 'Content-Type: application/json' \
    --data "$create_payload" | jq -er '.room_id')"
fi

declare -A display_names=(
  [a.byron]='Lord Byron'
  [a.maryshelley]='Mary Godwin'
  [a.clairmont]='Claire Clairmont'
  [a.shelley]='Percy Bysshe Shelley'
  [a.polidori]='John William Polidori'
)

for localpart in a.byron a.maryshelley a.clairmont a.shelley a.polidori; do
  token="$(login "$localpart")"
  user_id="@${localpart}:${MATRIX_DOMAIN}"
  encoded_user="$(jq -nr --arg value "$user_id" '$value|@uri')"

  jq -nc --arg displayname "${display_names[$localpart]}" '{displayname:$displayname}' |
    curl -fsS -X PUT "${MATRIX_BASE_URL}/_matrix/client/v3/profile/${encoded_user}/displayname" \
      -H "Authorization: Bearer ${token}" \
      -H 'Content-Type: application/json' --data-binary @- >/dev/null

  if [[ "$localpart" != 'a.byron' ]]; then
    curl -fsS -X POST "${MATRIX_BASE_URL}/_matrix/client/v3/join/${encoded_alias}" \
      -H "Authorization: Bearer ${token}" \
      -H 'Content-Type: application/json' --data '{}' >/dev/null
  fi
done

message_count="$(curl -fsS "${MATRIX_BASE_URL}/_matrix/client/v3/rooms/${room_id}/messages?dir=b&limit=100" \
  -H "Authorization: Bearer ${byron_token}" | jq '[.chunk[] | select(.type == "m.room.message")] | length')"

if [[ "$message_count" -eq 0 ]]; then
  txn_id="diodati-$(date +%s)"
  jq -nc '{msgtype:"m.text",body:"The storm has made conspirators of us. Come—let each tell a tale that would make even the lightning hesitate."}' |
    curl -fsS -X PUT "${MATRIX_BASE_URL}/_matrix/client/v3/rooms/${room_id}/send/m.room.message/${txn_id}" \
      -H "Authorization: Bearer ${byron_token}" \
      -H 'Content-Type: application/json' --data-binary @- >/dev/null
fi

printf '%s\n' "$room_id"
