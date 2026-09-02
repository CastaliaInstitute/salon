#!/usr/bin/env bash
set -euo pipefail

umask 077

backup_bucket="${MATRIX_BACKUP_BUCKET:-gs://inquiry-institute-matrix-backups}"
backup_root="${MATRIX_BACKUP_LOCAL_DIR:-/var/backups/matrix}"
matrix_root="${MATRIX_ROOT:-/opt/matrix}"
gcloud_bin="${GCLOUD_BIN:-/snap/google-cloud-cli/current/bin/gcloud}"
export CLOUDSDK_CONFIG="${CLOUDSDK_CONFIG:-${backup_root}/gcloud-config}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
staging="${backup_root}/${timestamp}"

mkdir -p "$staging" "$CLOUDSDK_CONFIG"
exec 9>"${backup_root}/backup.lock"
flock -n 9 || {
  echo "Another Matrix backup is already running" >&2
  exit 1
}

cleanup() {
  rm -rf "$staging"
}
trap cleanup EXIT

docker exec matrix-postgres pg_dump \
  --username=synapse \
  --dbname=synapse \
  --format=custom \
  --no-owner \
  --no-privileges >"${staging}/synapse.dump"

docker exec -i matrix-postgres pg_restore --list <"${staging}/synapse.dump" >/dev/null

tar --create --gzip --file "${staging}/matrix-config-media.tar.gz" \
  --directory "$matrix_root" \
  Caddyfile \
  docker-compose.yml \
  matrix-data

tar --create --gzip --file "${staging}/private-runtime.tar.gz" \
  --directory / \
  opt/matrix/.env \
  opt/matrix/diodati-accounts.env \
  etc/diodati-realtime.env \
  opt/diodati-realtime \
  var/lib/diodati-realtime \
  var/lib/diodati-visitor-rl

(
  cd "$staging"
  sha256sum synapse.dump matrix-config-media.tar.gz private-runtime.tar.gz >SHA256SUMS
)

cat >"${staging}/manifest.json" <<EOF
{
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "database": "synapse",
  "database_container": "matrix-postgres",
  "database_format": "postgres-custom",
  "host": "$(hostname)",
  "matrix_root": "${matrix_root}",
  "includes_private_runtime": true
}
EOF

"$gcloud_bin" storage cp --recursive "$staging" "${backup_bucket}/"
"$gcloud_bin" storage cp "${staging}/manifest.json" "${backup_bucket}/latest.json"

echo "Matrix backup uploaded to ${backup_bucket}/${timestamp}"
