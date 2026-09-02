#!/usr/bin/env bash
set -euo pipefail

# Retire only the superseded Matrix resources. This intentionally does not
# delete or disable the legacy project, which still hosts unrelated services.
legacy_project="${LEGACY_MATRIX_PROJECT:-institute-481516}"
canonical_project="${CANONICAL_MATRIX_PROJECT:-inquiry-institute}"
zone="${LEGACY_MATRIX_ZONE:-us-central1-b}"
region="${LEGACY_MATRIX_REGION:-us-central1}"
instance="${LEGACY_MATRIX_INSTANCE:-matrix-synapse}"
disk="${LEGACY_MATRIX_DISK:-matrix-synapse}"
address="${LEGACY_MATRIX_ADDRESS:-matrix-ip-central}"
snapshot="${LEGACY_MATRIX_SNAPSHOT:-matrix-synapse-pre-consolidation-20260901}"
rollback_deadline="${MATRIX_ROLLBACK_DEADLINE:-2026-09-22T21:08:19Z}"
old_ip="34.172.124.225"
apply=false

if [[ "${1:-}" == "--apply" ]]; then
  apply=true
elif [[ "${1:-}" != "" && "${1:-}" != "--dry-run" ]]; then
  echo "Usage: $0 [--dry-run|--apply]" >&2
  exit 2
fi

deadline_epoch="$(python3 - "$rollback_deadline" <<'PY'
import datetime
import sys

value = datetime.datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
print(int(value.timestamp()))
PY
)"
now_epoch="$(date -u +%s)"
if (( now_epoch < deadline_epoch )); then
  echo "Rollback window remains open until ${rollback_deadline}; refusing retirement." >&2
  exit 3
fi

canonical_status="$(gcloud compute instances describe matrix-synapse --project="$canonical_project" --zone=us-central1-b --format='value(status)')"
test "$canonical_status" = "RUNNING"
curl -fsS https://matrix.castalia.institute/_matrix/client/versions >/dev/null
test "$(curl -fsS https://matrix.castalia.institute/.well-known/matrix/server | jq -er '."m.server"')" = "matrix.castalia.institute:443"
test "$(dig +short A matrix.castalia.institute | grep -Fx 136.64.21.139)" = "136.64.21.139"
if dig +short A matrix.castalia.institute | grep -Fx "$old_ip" >/dev/null; then
  echo "Public Matrix DNS still points at the legacy address ${old_ip}" >&2
  exit 1
fi

legacy_status="$(gcloud compute instances describe "$instance" --project="$legacy_project" --zone="$zone" --format='value(status)')"
test "$legacy_status" = "TERMINATED"
test "$(gcloud compute snapshots describe "$snapshot" --project="$legacy_project" --format='value(status)')" = "READY"
test "$(gcloud compute addresses describe "$address" --project="$legacy_project" --region="$region" --format='value(address)')" = "$old_ip"

echo "Eligible legacy Matrix resources:"
echo "  ${legacy_project}/${zone}/instances/${instance}"
echo "  ${legacy_project}/${zone}/disks/${disk}"
echo "  ${legacy_project}/${region}/addresses/${address} (${old_ip})"
echo "  ${legacy_project}/global/snapshots/${snapshot}"

if ! "$apply"; then
  echo "Dry run only. Pass --apply after reviewing the verified rollback evidence."
  exit 0
fi

if [[ "${CONFIRM_LEGACY_MATRIX_RETIREMENT:-}" != "I_UNDERSTAND" ]]; then
  echo "Refusing destructive retirement without CONFIRM_LEGACY_MATRIX_RETIREMENT=I_UNDERSTAND" >&2
  exit 2
fi

gcloud compute instances delete "$instance" --project="$legacy_project" --zone="$zone" --quiet
gcloud compute disks delete "$disk" --project="$legacy_project" --zone="$zone" --quiet
gcloud compute addresses delete "$address" --project="$legacy_project" --region="$region" --quiet
gcloud compute snapshots delete "$snapshot" --project="$legacy_project" --quiet
echo "Retired only the superseded legacy Matrix VM, disk, address, and rollback snapshot."
