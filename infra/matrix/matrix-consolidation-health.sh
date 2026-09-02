#!/usr/bin/env bash
set -euo pipefail

umask 077

backup_bucket="${MATRIX_BACKUP_BUCKET:-gs://inquiry-institute-matrix-backups}"
state_dir="${MATRIX_HEALTH_STATE_DIR:-/var/lib/matrix-consolidation-health}"
gcloud_bin="${GCLOUD_BIN:-/snap/google-cloud-cli/current/bin/gcloud}"
export CLOUDSDK_CONFIG="${CLOUDSDK_CONFIG:-${state_dir}/gcloud-config}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
report="${state_dir}/${timestamp}.json"
latest_manifest="${state_dir}/latest-backup.json"

mkdir -p "$state_dir" "$CLOUDSDK_CONFIG"

matrix_version="$(curl -fsS --max-time 15 https://matrix.castalia.institute/_matrix/client/versions | jq -er '.versions[-1]')"
synapse_version="$(curl -fsS --max-time 15 https://matrix.castalia.institute/_matrix/federation/v1/version | jq -er '.server.version')"
salon_status="$(curl -fsS --max-time 15 -o /dev/null -w '%{http_code}' https://salon.castalia.institute/diodati/)"
test "$salon_status" = "200"

docker exec matrix-postgres pg_isready --username=synapse --dbname=synapse >/dev/null
realtime_status="$(systemctl is-active diodati-realtime.service)"
visitor_status="$(systemctl is-active diodati-visitor-rl.service)"
backup_timer_status="$(systemctl is-active matrix-backup.timer)"
test "$realtime_status" = "active"
test "$visitor_status" = "active"
test "$backup_timer_status" = "active"

"$gcloud_bin" storage cp "${backup_bucket}/latest.json" "$latest_manifest" >/dev/null
backup_created_at="$(jq -er .created_at "$latest_manifest")"
backup_age_seconds="$(python3 - "$backup_created_at" <<'PY'
import datetime
import sys

created = datetime.datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
now = datetime.datetime.now(datetime.timezone.utc)
print(max(0, int((now - created).total_seconds())))
PY
)"
if (( backup_age_seconds > 129600 )); then
  echo "Latest Matrix backup is older than 36 hours" >&2
  exit 1
fi

read -r user_count room_count event_count < <(
  docker exec matrix-postgres psql --username=synapse --dbname=synapse --tuples-only --no-align --field-separator=' ' \
    --command='select (select count(*) from users), (select count(*) from rooms), (select count(*) from events);'
)

jq -n \
  --arg checked_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg host "$(hostname)" \
  --arg matrix_version "$matrix_version" \
  --arg synapse_version "$synapse_version" \
  --arg salon_status "$salon_status" \
  --arg realtime_status "$realtime_status" \
  --arg visitor_status "$visitor_status" \
  --arg backup_timer_status "$backup_timer_status" \
  --arg backup_created_at "$backup_created_at" \
  --argjson backup_age_seconds "$backup_age_seconds" \
  --argjson users "$user_count" \
  --argjson rooms "$room_count" \
  --argjson events "$event_count" \
  '{
    checked_at: $checked_at,
    host: $host,
    status: "healthy",
    public: {
      matrix_client_version: $matrix_version,
      synapse_version: $synapse_version,
      salon_http_status: ($salon_status | tonumber)
    },
    services: {
      diodati_realtime: $realtime_status,
      diodati_visitor_rl: $visitor_status,
      matrix_backup_timer: $backup_timer_status
    },
    backup: {
      created_at: $backup_created_at,
      age_seconds: $backup_age_seconds
    },
    matrix_counts: {
      users: $users,
      rooms: $rooms,
      events: $events
    }
  }' >"$report"

"$gcloud_bin" storage cp "$report" "${backup_bucket}/health/${timestamp}.json" >/dev/null

metadata_url='http://metadata.google.internal/computeMetadata/v1'
metadata_header='Metadata-Flavor: Google'
project_id="$(curl -fsS -H "$metadata_header" "${metadata_url}/project/project-id")"
instance_id="$(curl -fsS -H "$metadata_header" "${metadata_url}/instance/id")"
zone="$(curl -fsS -H "$metadata_header" "${metadata_url}/instance/zone" | sed 's#.*/##')"
monitoring_token="$(curl -fsS -H "$metadata_header" "${metadata_url}/instance/service-accounts/default/token" | jq -er .access_token)"
metric_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
metric_payload="$(jq -nc \
  --arg project_id "$project_id" \
  --arg instance_id "$instance_id" \
  --arg zone "$zone" \
  --arg metric_time "$metric_time" \
  '{timeSeries:[{
    metric:{type:"custom.googleapis.com/castalia/matrix_consolidation_healthy"},
    resource:{type:"gce_instance",labels:{project_id:$project_id,instance_id:$instance_id,zone:$zone}},
    points:[{interval:{endTime:$metric_time},value:{boolValue:true}}]
  }]}')"
curl -fsS -X POST "https://monitoring.googleapis.com/v3/projects/${project_id}/timeSeries" \
  -H "Authorization: Bearer ${monitoring_token}" \
  -H 'Content-Type: application/json' \
  --data-binary "$metric_payload" >/dev/null

ln -sfn "$(basename "$report")" "${state_dir}/latest.json"
find "$state_dir" -maxdepth 1 -type f -name '*.json' -mtime +22 -delete

echo "Consolidation health witness uploaded: ${timestamp}"
