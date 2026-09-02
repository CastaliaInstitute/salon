#!/usr/bin/env bash

set -euo pipefail

MATRIX_SERVER="${MATRIX_SERVER:-https://matrix.castalia.institute}"
MATRIX_DOMAIN="${MATRIX_DOMAIN:-matrix.castalia.institute}"
MATRIX_ADMIN_USER="${MATRIX_ADMIN_USER:-diodati.admin}"
SUPABASE_URL="${SUPABASE_URL:-https://pilmscrodlitdrygabvo.supabase.co}"
DIODATI_ROOM_ID="${DIODATI_ROOM_ID:-}"

for required in MATRIX_ADMIN_PASSWORD SUPABASE_SERVICE_ROLE_KEY DIODATI_ROOM_ID; do
  if [[ -z "${!required:-}" ]]; then
    echo "$required is required" >&2
    exit 1
  fi
done

if [[ -n "${MATRIX_ADMIN_ACCESS_TOKEN:-}" ]]; then
  admin_token="$MATRIX_ADMIN_ACCESS_TOKEN"
else
  admin_token="$(jq -nc --arg user "$MATRIX_ADMIN_USER" --arg password "$MATRIX_ADMIN_PASSWORD" \
    '{type:"m.login.password",identifier:{type:"m.id.user",user:$user},password:$password}' |
    curl -fsS --retry 8 --retry-all-errors --retry-delay 4 -X POST "${MATRIX_SERVER}/_matrix/client/v3/login" \
      -H 'X-Forwarded-For: 127.0.10.1' \
      -H 'Content-Type: application/json' --data-binary @- | jq -er '.access_token')"
fi

rest_headers=(
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
  -H 'Content-Type: application/json'
  -H 'Prefer: resolution=merge-duplicates,return=minimal'
)

display_name_for() {
  case "$1" in
    a.byron) echo 'George Gordon Byron, Lord Byron' ;;
    a.maryshelley) echo 'Mary Godwin' ;;
    a.clairmont) echo 'Claire Clairmont' ;;
    a.shelley) echo 'Percy Bysshe Shelley' ;;
    a.polidori) echo 'John William Polidori' ;;
    *) return 1 ;;
  esac
}

login_octet=10
for faculty_id in a.byron a.maryshelley a.clairmont a.shelley a.polidori; do
  username="@${faculty_id}:${MATRIX_DOMAIN}"
  encoded_user="$(jq -nr --arg value "$username" '$value|@uri')"
  password="$(openssl rand -hex 24)"

  jq -nc --arg password "$password" --arg displayname "$(display_name_for "$faculty_id")" \
    '{password:$password,displayname:$displayname,admin:false,deactivated:false}' |
    curl -fsS --retry 8 --retry-all-errors --retry-delay 4 -X PUT "${MATRIX_SERVER}/_synapse/admin/v2/users/${encoded_user}" \
      -H "Authorization: Bearer ${admin_token}" \
      -H 'Content-Type: application/json' --data-binary @- >/dev/null

  access_token="$(jq -nc --arg user "$faculty_id" --arg password "$password" \
    '{type:"m.login.password",identifier:{type:"m.id.user",user:$user},password:$password}' |
    curl -fsS --retry 8 --retry-all-errors --retry-delay 4 -X POST "${MATRIX_SERVER}/_matrix/client/v3/login" \
      -H "X-Forwarded-For: 127.0.20.${login_octet}" \
      -H 'Content-Type: application/json' --data-binary @- | jq -er '.access_token')"
  login_octet=$((login_octet + 1))

  encoded_room="$(jq -nr --arg value "$DIODATI_ROOM_ID" '$value|@uri')"
  curl -fsS --retry 8 --retry-all-errors --retry-delay 4 -X POST "${MATRIX_SERVER}/_matrix/client/v3/join/${encoded_room}" \
    -H "Authorization: Bearer ${access_token}" \
    -H 'Content-Type: application/json' --data '{}' >/dev/null

  jq -nc \
    --arg username "$username" \
    --arg password "$password" \
    --arg faculty_id "$faculty_id" \
    --arg room_id "$DIODATI_ROOM_ID" \
    --arg access_token "$access_token" \
    '{username:$username,password:$password,faculty_id:$faculty_id,room_ids:[$room_id],active:true,access_token:$access_token,access_token_expiry:"2099-01-01T00:00:00Z",sync_token:null}' |
    curl -fsS -X POST "${SUPABASE_URL}/rest/v1/matrix_bots?on_conflict=username" \
      "${rest_headers[@]}" --data-binary @- >/dev/null

  faculty_filter="$(jq -nr --arg value "eq.${faculty_id}" '$value|@uri')"
  username_filter="$(jq -nr --arg value "neq.${username}" '$value|@uri')"
  curl -fsS -X PATCH "${SUPABASE_URL}/rest/v1/matrix_bots?faculty_id=${faculty_filter}&username=${username_filter}" \
    "${rest_headers[@]}" --data-binary '{"active":false}' >/dev/null
done

jq -nc --arg room_id "$DIODATI_ROOM_ID" \
  '{room_id:$room_id,name:"Villa Diodati",type:"salon",routing_mode:"all"}' |
  curl -fsS -X POST "${SUPABASE_URL}/rest/v1/matrix_rooms?on_conflict=room_id" \
    "${rest_headers[@]}" --data-binary @- >/dev/null

jq -nc --arg room_id "$DIODATI_ROOM_ID" '[
  {room_id:$room_id,faculty_id:"a.byron",role:"moderator",priority:100},
  {room_id:$room_id,faculty_id:"a.maryshelley",role:"speaker",priority:90},
  {room_id:$room_id,faculty_id:"a.clairmont",role:"speaker",priority:85},
  {room_id:$room_id,faculty_id:"a.shelley",role:"speaker",priority:80},
  {room_id:$room_id,faculty_id:"a.polidori",role:"speaker",priority:70}
]' |
  curl -fsS -X POST "${SUPABASE_URL}/rest/v1/room_faculty_membership?on_conflict=room_id,faculty_id" \
    "${rest_headers[@]}" --data-binary @- >/dev/null

echo "Configured five realtime Villa Diodati agents for ${DIODATI_ROOM_ID}"
