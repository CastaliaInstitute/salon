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

admin_token="$(jq -nc --arg user "$MATRIX_ADMIN_USER" --arg password "$MATRIX_ADMIN_PASSWORD" \
  '{type:"m.login.password",identifier:{type:"m.id.user",user:$user},password:$password}' |
  curl -fsS -X POST "${MATRIX_SERVER}/_matrix/client/v3/login" \
    -H 'Content-Type: application/json' --data-binary @- | jq -er '.access_token')"

rest_headers=(
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
  -H 'Content-Type: application/json'
  -H 'Prefer: resolution=merge-duplicates,return=minimal'
)

display_name_for() {
  case "$1" in
    a.byron) echo 'George Gordon Byron, Lord Byron' ;;
    a.shelley) echo 'Mary Wollstonecraft Shelley' ;;
    a.shelley1) echo 'Percy Bysshe Shelley' ;;
    a.polidori) echo 'John William Polidori' ;;
    *) return 1 ;;
  esac
}

for faculty_id in a.byron a.shelley a.shelley1 a.polidori; do
  username="@${faculty_id}:${MATRIX_DOMAIN}"
  encoded_user="$(jq -nr --arg value "$username" '$value|@uri')"
  password="$(openssl rand -hex 24)"

  jq -nc --arg password "$password" --arg displayname "$(display_name_for "$faculty_id")" \
    '{password:$password,displayname:$displayname,admin:false,deactivated:false}' |
    curl -fsS -X PUT "${MATRIX_SERVER}/_synapse/admin/v2/users/${encoded_user}" \
      -H "Authorization: Bearer ${admin_token}" \
      -H 'Content-Type: application/json' --data-binary @- >/dev/null

  access_token="$(jq -nc --arg user "$faculty_id" --arg password "$password" \
    '{type:"m.login.password",identifier:{type:"m.id.user",user:$user},password:$password}' |
    curl -fsS -X POST "${MATRIX_SERVER}/_matrix/client/v3/login" \
      -H 'Content-Type: application/json' --data-binary @- | jq -er '.access_token')"

  encoded_room="$(jq -nr --arg value "$DIODATI_ROOM_ID" '$value|@uri')"
  curl -fsS -X POST "${MATRIX_SERVER}/_matrix/client/v3/join/${encoded_room}" \
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
done

jq -nc --arg room_id "$DIODATI_ROOM_ID" \
  '{room_id:$room_id,name:"Villa Diodati",type:"salon",routing_mode:"all"}' |
  curl -fsS -X POST "${SUPABASE_URL}/rest/v1/matrix_rooms?on_conflict=room_id" \
    "${rest_headers[@]}" --data-binary @- >/dev/null

jq -nc --arg room_id "$DIODATI_ROOM_ID" '[
  {room_id:$room_id,faculty_id:"a.byron",role:"moderator",priority:100},
  {room_id:$room_id,faculty_id:"a.shelley",role:"speaker",priority:90},
  {room_id:$room_id,faculty_id:"a.shelley1",role:"speaker",priority:80},
  {room_id:$room_id,faculty_id:"a.polidori",role:"speaker",priority:70}
]' |
  curl -fsS -X POST "${SUPABASE_URL}/rest/v1/room_faculty_membership?on_conflict=room_id,faculty_id" \
    "${rest_headers[@]}" --data-binary @- >/dev/null

echo "Configured four realtime Villa Diodati agents for ${DIODATI_ROOM_ID}"
