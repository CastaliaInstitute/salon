#!/usr/bin/env bash
set -euo pipefail

umask 077

matrix_base_url="${MATRIX_BASE_URL:-http://localhost:8008}"
matrix_domain="${MATRIX_DOMAIN:-matrix.castalia.institute}"
homeserver_config="${SYNAPSE_CONFIG:-/opt/matrix/matrix-data/homeserver.yaml}"
runtime_env="${DIODATI_ENV_FILE:-/etc/diodati-realtime.env}"
agent_provisioner="${DIODATI_AGENT_PROVISIONER:-/opt/diodati-realtime/configure-diodati-agents.sh}"
temporary_admin="diodati.provision.$(date -u +%s)"
temporary_password="$(openssl rand -hex 32)"
visitor_localpart="salon.rl"
visitor_user_id="@${visitor_localpart}:${matrix_domain}"
visitor_password="$(openssl rand -hex 32)"

if [[ ! -r "$runtime_env" || ! -x "$agent_provisioner" ]]; then
  echo "Diodati environment or agent provisioner is unavailable" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$runtime_env"
set +a

registration_secret="$(python3 - "$homeserver_config" <<'PY'
import ast
import re
import sys

for line in open(sys.argv[1], encoding="utf-8"):
    match = re.match(r"^\s*registration_shared_secret:\s*(.+?)\s*$", line)
    if not match:
        continue
    value = match.group(1)
    try:
        value = ast.literal_eval(value)
    except (SyntaxError, ValueError):
        pass
    print(value, end="")
    break
PY
)"
test -n "$registration_secret"

nonce="$(curl -fsS --retry 8 --retry-all-errors --retry-delay 4 "${matrix_base_url}/_synapse/admin/v1/register" | jq -er .nonce)"
registration_mac="$(REGISTRATION_SECRET="$registration_secret" python3 - "$nonce" "$temporary_admin" "$temporary_password" <<'PY'
import hashlib
import hmac
import os
import sys

message = "\0".join([sys.argv[1], sys.argv[2], sys.argv[3], "admin"]).encode()
print(hmac.new(os.environ["REGISTRATION_SECRET"].encode(), message, hashlib.sha1).hexdigest())
PY
)"

admin_token="$(jq -nc \
  --arg nonce "$nonce" \
  --arg username "$temporary_admin" \
  --arg password "$temporary_password" \
  --arg mac "$registration_mac" \
  '{nonce:$nonce,username:$username,password:$password,admin:true,mac:$mac}' |
  curl -fsS --retry 8 --retry-all-errors --retry-delay 4 -X POST "${matrix_base_url}/_synapse/admin/v1/register" \
    -H 'Content-Type: application/json' --data-binary @- | jq -er .access_token)"

deactivate_admin() {
  local user_id="$1"
  local encoded_user
  encoded_user="$(jq -nr --arg value "$user_id" '$value|@uri')"
  jq -nc '{deactivated:true}' |
    curl -fsS --retry 8 --retry-all-errors --retry-delay 4 -X PUT "${matrix_base_url}/_synapse/admin/v2/users/${encoded_user}" \
      -H "Authorization: Bearer ${admin_token}" \
      -H 'Content-Type: application/json' --data-binary @- >/dev/null || true
}

deactivate_temporary_admin() {
  deactivate_admin "@${temporary_admin}:${matrix_domain}"
}
trap deactivate_temporary_admin EXIT

while IFS= read -r stale_admin; do
  if [[ -n "$stale_admin" && "$stale_admin" != "@${temporary_admin}:${matrix_domain}" ]]; then
    deactivate_admin "$stale_admin"
  fi
done < <(docker exec matrix-postgres psql -U synapse -d synapse -Atc \
  "select name from users where name like '@diodati.provision.%' and admin = 1 and deactivated = 0")

MATRIX_SERVER="$matrix_base_url" \
MATRIX_DOMAIN="$matrix_domain" \
MATRIX_ADMIN_USER="$temporary_admin" \
MATRIX_ADMIN_PASSWORD="$temporary_password" \
MATRIX_ADMIN_ACCESS_TOKEN="$admin_token" \
SUPABASE_URL="${SUPABASE_URL:?SUPABASE_URL is required}" \
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}" \
DIODATI_ROOM_ID="${DIODATI_ROOM_ID:?DIODATI_ROOM_ID is required}" \
  "$agent_provisioner"

encoded_visitor="$(jq -nr --arg value "$visitor_user_id" '$value|@uri')"
jq -nc --arg password "$visitor_password" \
  '{password:$password,displayname:"Salon RL Visitor",admin:false,deactivated:false,logout_devices:true}' |
  curl -fsS --retry 8 --retry-all-errors --retry-delay 4 -X PUT "${matrix_base_url}/_synapse/admin/v2/users/${encoded_visitor}" \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'Content-Type: application/json' --data-binary @- >/dev/null

visitor_token="$(jq -nc --arg user "$visitor_localpart" --arg password "$visitor_password" \
  '{type:"m.login.password",identifier:{type:"m.id.user",user:$user},password:$password}' |
  curl -fsS --retry 8 --retry-all-errors --retry-delay 4 -X POST "${matrix_base_url}/_matrix/client/v3/login" \
    -H 'X-Forwarded-For: 127.0.30.1' \
    -H 'Content-Type: application/json' --data-binary @- | jq -er .access_token)"
encoded_room="$(jq -nr --arg value "$DIODATI_ROOM_ID" '$value|@uri')"
curl -fsS --retry 8 --retry-all-errors --retry-delay 4 -X POST "${matrix_base_url}/_matrix/client/v3/join/${encoded_room}" \
  -H "Authorization: Bearer ${visitor_token}" \
  -H 'Content-Type: application/json' --data '{}' >/dev/null

updated_env="$(mktemp "${runtime_env}.XXXXXX")"
awk -F= '!/^(DIODATI_RL_USER_ID|DIODATI_RL_ACCESS_TOKEN|DIODATI_RL_STATE_DIR|DIODATI_REGISTERED_MATRIX_USERS)=/' \
  "$runtime_env" >"$updated_env"
printf '%s\n' \
  "DIODATI_RL_USER_ID=${visitor_user_id}" \
  "DIODATI_RL_ACCESS_TOKEN=${visitor_token}" \
  'DIODATI_RL_STATE_DIR=/var/lib/diodati-visitor-rl' \
  "DIODATI_REGISTERED_MATRIX_USERS=${visitor_user_id}" >>"$updated_env"
chown root:root "$updated_env"
chmod 0600 "$updated_env"
mv "$updated_env" "$runtime_env"

systemctl enable diodati-visitor-rl.service
systemctl restart diodati-visitor-rl.service
echo "Canonical Diodati agents and observation-only realtime visitor provisioned"
