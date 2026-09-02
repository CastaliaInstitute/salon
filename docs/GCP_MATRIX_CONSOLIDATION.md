# Matrix consolidation and rollback

## Canonical production

- Project: `inquiry-institute` (`370359270831`)
- VM: `matrix-synapse`, `us-central1-b`
- Disk: `matrix-synapse-migration`, 50 GB, auto-delete disabled
- Static address: `matrix-ip-central`, `136.64.21.139`
- Runtime service account: `matrix-synapse@inquiry-institute.iam.gserviceaccount.com`
- Public endpoint: `https://matrix.castalia.institute`

The canonical Caddy configuration is checked in at
`infra/matrix/Caddyfile`. It serves Matrix client discovery and the standard
server discovery response `matrix.castalia.institute:443`, keeping federation
on the public TLS endpoint rather than requiring port 8448. The live endpoint
and the Matrix federation tester were verified after cutover.

The prior project, `institute-481516`, is not a production target. Its terminated
`matrix-synapse` VM and disk are rollback-only assets.

### Legacy-project inventory and retirement boundary

An audit on **2026-09-02** found that `institute-481516` is not an empty or
Matrix-only project. It still contains active workloads that must not be
deleted as part of the Matrix rollback-window procedure:

- Cloud Run services including `castalia-face-api`, `castalia-omnisvg`,
  `castalia-tournament-api`, `codex`, `commonplace-directus`, `ghost`,
  `outline`, `talkie-*`, `therapist-*`, and `zonetrip-processor`.
- Runnable Cloud SQL instances `outline-db` and `ghost-db-instance`, plus
  the `outline-redis` Memorystore instance.
- Running Compute Engine instances `gotosocial-vm` and `lms-moodle`.
- Production or build buckets, including `inquiry-castalia-corpora`,
  `castalia-gazetteer-files`, Ghost/Therapist state, and Cloud Build buckets.
- Legacy service accounts and Secret Manager entries used by those workloads.

The live dependency map recorded during that audit is:

| Legacy surface | Observed resources | Required before migration or retirement |
| --- | --- | --- |
| Cloud Run | `castalia-face-api`, `castalia-omnisvg`, `castalia-omnisvg-8b-test`, `castalia-tournament-api`, `codex`, `commonplace-directus`, `faculty-oauth-appservice`, `ghost`, `openclaw-chat-proxy`, `outline`, `outline-test-db`, `talkie-gpu`, `talkie-web`, `therapist-hello-test`, `therapist-session`, `zonetrip-processor` | Copy or rebuild images in the canonical Artifact Registry; recreate service accounts, secret bindings, environment configuration, ingress, traffic, and custom-domain cutovers; run application smoke tests. |
| Cloud Run custom domains | `codex.castalia.institute`, `commonplace.castalia.institute`, `commonplace.inquiry.institute`, `face-api.castalia.institute`, `talkie.castalia.institute` | Verify ownership records and TLS issuance in the canonical project before changing DNS. |
| Stateful services | Cloud SQL `outline-db` and `ghost-db-instance`; Memorystore `outline-redis` | Take application-consistent exports, restore into canonical services, validate row counts and application reads/writes, then perform a planned cutover. |
| Compute Engine | Running `gotosocial-vm` and `lms-moodle`; stopped legacy Matrix VM | Migrate each stateful VM and DNS identity separately. Only the stopped Matrix VM is covered by the rollback gate below. |
| Storage and identity | Corpora, gazetteer, Ghost/Therapist state, build buckets; legacy service accounts and secrets | Classify ownership, copy data with checksums, rotate secrets, recreate least-privilege IAM, and verify consumers before decommissioning. |
| Network remnants | `ghost-vpc` plus WorkAdventure/Kubernetes load-balancer artifacts | Identify current DNS consumers and owners; do not delete as part of Matrix cleanup. |

The **2026-09-02 identity parity audit** was performed with the custodial
operator account and compared names only; no secret values were read. The
legacy-only Secret Manager names are `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_URL`, `THERAPIST_SUPABASE_RAG_AUTH_KEY`, `THERAPIST_SUPABASE_URL`,
`db-password`, `directus-castalia-oidc-client-id`,
`directus-castalia-oidc-client-secret`, `gcs-keyfile`, `mail-password`,
`mail-user`, `openclaw-gateway-token`, `outline-database-password`,
`outline-database-url`, `outline-database-url-public`,
`outline-oidc-client-id`, `outline-oidc-client-secret`, `outline-redis-url`,
`outline-secret-key`, and `outline-utils-secret`. These require owner and
consumer mapping, rotation or controlled transfer, and application tests;
they must not be copied by name alone.

Legacy-only service-account identities include the old project compute,
Firebase, Gazetteer, Agora, Ghost GCS, Sheet, Calendar, Mynah STT, Therapist,
Vertex AI, and old project App Engine accounts. Canonical replacements exist
for some workloads, including `castalia-omnisvg`, `ghost-sa`, and the default
compute/App Engine identities, but names are not proof of equivalent IAM.
Each consumer must be rebound to a least-privilege canonical identity and
verified before its legacy account is disabled.

The `inquiry-castalia-corpora` bucket has been staged as
`inquiry-institute-castalia-corpora` in the canonical project. A checksum-only
verification found 49 objects and 7,699,333 bytes on each side, with no
remaining sync changes. The legacy bucket remains intact and its consumers
have not yet been rebound, so this is a reversible data copy rather than a
completed bucket cutover.

The remaining bucket audit found no data objects in
`castalia-gazetteer-files` or `institute-481516-ghost-content`; the former
still has an explicit legacy service-account grant and needs identity mapping
before recreation. `institute-481516-therapist-state` contains 56 objects
(approximately 2.07 GB) and must be copied only with a Therapist-consistent
freeze or replication procedure. `institute-481516_cloudbuild` contains
provider-managed build artifacts and is not a user-data migration candidate.

The first no-traffic staging attempt for `castalia-omnisvg` was rejected by
Cloud Run because the canonical project has no quota for its one NVIDIA L4
GPU without zonal redundancy. No canary service was created and the legacy
service received no traffic change. A GPU quota decision and cost/availability
review are required before staging that workload; quota has not been
requested automatically.

These resources are not part of the Matrix rollback asset set and have not
been migrated or decommissioned. The old project therefore cannot be retired
or disabled wholesale. A full Castalia project consolidation requires a
separate service-by-service migration plan covering image provenance,
database exports and restores, DNS/custom domains, secret rotation, IAM
replacement, and application-level cutover tests. Until that plan is complete,
the only approved old-project retirement candidates are the stopped legacy
Matrix VM and its disk, and only after the rollback window below plus explicit
approval.

The checked-in `infra/matrix/retire-legacy-matrix.sh` is the retirement gate
for those four superseded Matrix assets (VM, disk, static address, and source
snapshot). It is dry-run by default, refuses to run before the rollback
deadline, verifies canonical health and DNS, and requires both `--apply` and
`CONFIRM_LEGACY_MATRIX_RETIREMENT=I_UNDERSTAND` for deletion. It never deletes
the legacy project or its unrelated workloads.

## Cutover record and rollback window

The source VM stopped at `2026-09-01T21:08:19Z`. The source snapshot
`matrix-synapse-pre-consolidation-20260901` completed before the target began
serving. The target snapshot `matrix-synapse-post-consolidation-20260901` was
also created while the migrated disk was quiescent. DNS now resolves to the
target's reserved address.

The rollback window is **21 days**, through **2026-09-22T21:08:19Z**. Do not
delete the old VM, disk, address, project, or pre-consolidation snapshot before
that timestamp. After the window, retirement still requires a fresh production
backup, a successful restore validation, and explicit approval.

## Backups

Two independent layers protect Matrix:

1. A daily Compute Engine snapshot schedule retains 21 days of boot-disk
   snapshots.
2. `matrix-backup.timer` makes a PostgreSQL custom-format dump and archives the
   Matrix configuration and media store. A separate private archive preserves
   the Matrix Docker environment, Diodati environment, agent credentials,
   deployed runtime, cycle state, and RL trajectory state. All artifacts go to
   `gs://inquiry-institute-matrix-backups`. The bucket has uniform access,
   object versioning, and a 21-day retention policy.

Install the checked-in units on the target VM:

```bash
sudo install -m 0750 infra/matrix/matrix-backup.sh /usr/local/sbin/matrix-backup
sudo install -m 0750 infra/matrix/validate-matrix-backup.sh /usr/local/sbin/validate-matrix-backup
sudo install -m 0644 infra/matrix/matrix-backup.service /etc/systemd/system/matrix-backup.service
sudo install -m 0644 infra/matrix/matrix-backup.timer /etc/systemd/system/matrix-backup.timer
sudo install -m 0750 infra/matrix/matrix-consolidation-health.sh /usr/local/sbin/matrix-consolidation-health
sudo install -m 0644 infra/matrix/matrix-consolidation-health.service /etc/systemd/system/matrix-consolidation-health.service
sudo install -m 0644 infra/matrix/matrix-consolidation-health.timer /etc/systemd/system/matrix-consolidation-health.timer
sudo systemctl daemon-reload
sudo systemctl enable --now matrix-backup.timer
sudo systemctl enable --now matrix-consolidation-health.timer
sudo systemctl start matrix-backup.service
sudo /usr/local/sbin/validate-matrix-backup
```

Validation downloads the newest backup, verifies every checksum and both public
and private archive structures, restores the dump into an isolated temporary
PostgreSQL 15 container, reports user/room/event counts, and removes the
validation container. It lists paths only and never prints secret values.

`matrix-consolidation-health.timer` runs hourly throughout the rollback window.
It verifies the public Matrix client and federation endpoints, the Salon page,
PostgreSQL readiness, both Diodati services, the backup timer, and a latest
backup age under 36 hours. Successful non-secret JSON witnesses are retained at
`gs://inquiry-institute-matrix-backups/health/`; the absence of a witness or a
failed unit means the window is not yet proven healthy.
Each successful witness also writes the boolean metric
`custom.googleapis.com/castalia/matrix_consolidation_healthy`. Cloud Monitoring
opens an incident if that metric is absent for two hours. The public Salon has
its own regional uptime check and two-minute outage policy alongside Matrix.
These policies intentionally have no notification destination until an approved
email, webhook, PagerDuty, Pub/Sub, Slack, or SMS channel is configured.

Configure or reconcile the checks and policies from an authenticated operator
workstation. The script is idempotent and refuses a noncanonical project:

```bash
./infra/matrix/configure-consolidation-monitoring.sh
```

As of September 2, 2026, the enabled policies are `Matrix Synapse production
unavailable`, `Villa Diodati Salon unavailable`, and `Matrix consolidation
witness missing`. Before production paging can be claimed, an owner must choose
and verify a notification channel, attach it to all three policies, and test a
notification. Console-visible incidents alone are not paging.

## Rollback procedure

Rollback is justified only for a target-side fault that cannot be repaired in
place. Matrix must never run writable in both projects.

1. Announce maintenance and record the target's current DNS, VM state, database
   counts, and latest backup validation.
2. Stop the target's Diodati services and Docker stack.
3. Create and wait for a final target disk snapshot.
4. Start the source VM and verify Synapse locally by its internal address.
5. Reserve or confirm the intended rollback address; never assume the source's
   former ephemeral address.
6. Update only the `matrix.castalia.institute` A record and wait for public
   client, federation, login-flow, room-alias, and Salon guest-read checks.
7. Keep the target stopped and intact until the incident is closed.

Returning to the target repeats the same single-writer process in the opposite
direction and must account for any events accepted by the rollback host.

### Isolated rollback rehearsal — September 2, 2026

The pre-consolidation snapshot was cloned into `inquiry-institute` and booted as
`matrix-rollback-rehearsal-20260902` with no public IP and no DNS change. Docker
started Element, Synapse 1.151.0, Caddy, PostgreSQL 15, Redis, and CalDAV. Both
local Matrix client and federation version endpoints answered, PostgreSQL was
ready, the Diodati room alias resolved, and the snapshot contained 59 users, 1
room, and 80 events. Production remained on `136.64.21.139` and healthy.

The disposable rehearsal VM and cloned disk were deleted after verification.
The protected source VM, source disk, and
`matrix-synapse-pre-consolidation-20260901` snapshot were not modified. This
proves the preserved snapshot is bootable; an actual rollback must still follow
the single-writer and DNS procedure above.

## Required health checks

```bash
curl -fsS https://matrix.castalia.institute/_matrix/client/versions
curl -fsS https://matrix.castalia.institute/_matrix/federation/v1/version
curl -fsS https://matrix.castalia.institute/_matrix/client/v3/login
curl -fsS 'https://matrix.castalia.institute/_matrix/client/v3/directory/room/%23villa-diodati%3Amatrix.castalia.institute'
curl -fsSI https://salon.castalia.institute/diodati/
```

Also register a temporary Matrix guest, join the Diodati alias, and confirm that
recent events can be read. Do not post a synthetic message to the production
salon merely as a health check.

## Canonical agents and realtime RL visitor

`infra/matrix/provision-diodati-runtime.sh` reconciles the five character
accounts to `a.byron`, `a.maryshelley`, `a.clairmont`, `a.shelley`, and
`a.polidori`; updates their existing Supabase bot records; and creates the
non-admin `salon.rl` observation account. It enables the realtime visitor with
no policy URL, so its only action is `wait`. The script creates a short-lived
Synapse administrator from the local shared registration secret and deactivates
that administrator on exit. Legacy character accounts are deactivated without
deleting their historical events. The script never prints generated passwords
or tokens.
