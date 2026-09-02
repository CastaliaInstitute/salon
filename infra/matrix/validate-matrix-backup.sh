#!/usr/bin/env bash
set -euo pipefail

umask 077

backup_bucket="${MATRIX_BACKUP_BUCKET:-gs://inquiry-institute-matrix-backups}"
gcloud_bin="${GCLOUD_BIN:-/snap/google-cloud-cli/current/bin/gcloud}"
export CLOUDSDK_CONFIG="${CLOUDSDK_CONFIG:-/var/backups/matrix/gcloud-config}"
validation_root="$(mktemp -d /var/tmp/matrix-restore-validation.XXXXXX)"
container="matrix-restore-validation"

cleanup() {
  docker rm --force "$container" >/dev/null 2>&1 || true
  rm -rf "$validation_root"
}
trap cleanup EXIT

latest_object="$("$gcloud_bin" storage ls "${backup_bucket}/**/manifest.json" | sort | tail -n 1)"
test -n "$latest_object"
backup_prefix="${latest_object%/manifest.json}"

"$gcloud_bin" storage cp "${backup_prefix}/synapse.dump" "$validation_root/"
"$gcloud_bin" storage cp "${backup_prefix}/matrix-config-media.tar.gz" "$validation_root/"
"$gcloud_bin" storage cp "${backup_prefix}/private-runtime.tar.gz" "$validation_root/"
"$gcloud_bin" storage cp "${backup_prefix}/SHA256SUMS" "$validation_root/"

(
  cd "$validation_root"
  sha256sum --check SHA256SUMS
  tar --list --gzip --file matrix-config-media.tar.gz >/dev/null
  private_listing="$(tar --list --gzip --file private-runtime.tar.gz)"
  for required in \
    opt/matrix/.env \
    opt/matrix/diodati-accounts.env \
    etc/diodati-realtime.env \
    opt/diodati-realtime/ \
    var/lib/diodati-realtime/ \
    var/lib/diodati-visitor-rl/; do
    grep -Fxq "$required" <<<"$private_listing"
  done
)

validation_password="$(openssl rand -hex 24)"
docker run --detach --name "$container" \
  --env "POSTGRES_PASSWORD=${validation_password}" \
  postgres:15-alpine >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready --username=postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$container" pg_isready --username=postgres >/dev/null
docker exec "$container" createdb --username=postgres synapse_restore
docker exec -i "$container" pg_restore \
  --username=postgres \
  --dbname=synapse_restore \
  --no-owner \
  --no-privileges <"${validation_root}/synapse.dump"

users="$(docker exec "$container" psql --username=postgres --dbname=synapse_restore --tuples-only --no-align --command='select count(*) from users;')"
rooms="$(docker exec "$container" psql --username=postgres --dbname=synapse_restore --tuples-only --no-align --command='select count(*) from rooms;')"
events="$(docker exec "$container" psql --username=postgres --dbname=synapse_restore --tuples-only --no-align --command='select count(*) from events;')"

echo "Validated ${backup_prefix}: users=${users} rooms=${rooms} events=${events}"
