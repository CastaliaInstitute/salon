#!/usr/bin/env bash
set -euo pipefail

# Copy the checked-in Diodati runtime to the canonical Matrix VM.  This script
# deliberately does not copy /etc/diodati-realtime.env, Matrix data, or tokens.
# It is dry-run by default; --apply is required for the remote write/restart.

project="${DIODATI_GCP_PROJECT:-inquiry-institute}"
zone="${DIODATI_GCP_ZONE:-us-central1-b}"
instance="${DIODATI_GCP_INSTANCE:-matrix-synapse}"
remote_root="${DIODATI_REMOTE_ROOT:-/opt/diodati-realtime}"
tunnel_through_iap="${DIODATI_TUNNEL_THROUGH_IAP:-false}"
apply=false

usage() {
  cat <<'EOF'
Usage: deploy-diodati-runtime.sh [--apply]

Dry-run by default. With --apply, update only the checked-in Diodati runtime,
RAG corpus, and systemd unit files on the canonical Matrix VM, then restart
diodati-realtime.service and diodati-visitor-rl.service.

Environment overrides: DIODATI_GCP_PROJECT, DIODATI_GCP_ZONE,
DIODATI_GCP_INSTANCE, DIODATI_REMOTE_ROOT, DIODATI_TUNNEL_THROUGH_IAP.
EOF
}

while (($#)); do
  case "$1" in
    --apply) apply=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
release_dir="$(mktemp -d "${TMPDIR:-/tmp}/diodati-runtime.XXXXXX")"
trap 'rm -rf "$release_dir"' EXIT

mkdir -p "$release_dir/scripts" "$release_dir/data" "$release_dir/units"
install -m 0750 \
  "$repo_root/scripts/diodati_realtime.py" \
  "$repo_root/scripts/diodati_visitor_rl.py" \
  "$repo_root/scripts/configure-diodati-agents.sh" \
  "$release_dir/scripts/"
install -m 0640 "$repo_root/data/diodati_rag.json" "$release_dir/data/"
install -m 0644 \
  "$repo_root/scripts/diodati-realtime.service" \
  "$repo_root/scripts/diodati-visitor-rl.service" \
  "$release_dir/units/"

target="${instance}:${remote_root}"
gcloud_args=(--project="$project" --zone="$zone")
if [[ "$tunnel_through_iap" == true ]]; then
  gcloud_args+=(--tunnel-through-iap)
fi
remote_release="/tmp/diodati-runtime-release-$$"

echo "Target: ${instance} (${project}/${zone})"
echo "Payload: runtime Python, visitor RL, agent provisioner, RAG corpus, and service units"
echo "Excluded: environment files, credentials, Matrix database/media, and cycle state"
if [[ "$apply" != true ]]; then
  echo "Dry run: rerun with --apply to copy and restart the services."
  exit 0
fi

gcloud compute ssh "${gcloud_args[@]}" "$instance" \
  --command="set -eu; sudo install -d -o diodati -g diodati -m 0750 '$remote_root'; install -d -m 0700 '$remote_release'"
gcloud compute scp "${gcloud_args[@]}" --recurse "$release_dir/scripts" "$release_dir/data" "$release_dir/units" "${instance}:${remote_release}/"
gcloud compute ssh "${gcloud_args[@]}" "$instance" --command="set -eu
sudo install -o diodati -g diodati -m 0750 '$remote_release/scripts/diodati_realtime.py' '$remote_root/diodati_realtime.py'
sudo install -o diodati -g diodati -m 0750 '$remote_release/scripts/diodati_visitor_rl.py' '$remote_root/diodati_visitor_rl.py'
sudo install -o diodati -g diodati -m 0750 '$remote_release/scripts/configure-diodati-agents.sh' '$remote_root/configure-diodati-agents.sh'
sudo install -o diodati -g diodati -m 0640 '$remote_release/data/diodati_rag.json' '$remote_root/diodati_rag.json'
sudo install -m 0644 '$remote_release/units/diodati-realtime.service' /etc/systemd/system/diodati-realtime.service
sudo install -m 0644 '$remote_release/units/diodati-visitor-rl.service' /etc/systemd/system/diodati-visitor-rl.service
sudo systemctl daemon-reload
sudo systemctl restart diodati-realtime.service diodati-visitor-rl.service
sudo systemctl is-active --quiet diodati-realtime.service
sudo systemctl is-active --quiet diodati-visitor-rl.service
rm -rf '$remote_release'
"
echo "Diodati runtime deployed and both services are active."
