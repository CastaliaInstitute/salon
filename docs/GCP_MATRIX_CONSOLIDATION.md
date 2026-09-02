# Matrix consolidation and rollback

## Canonical production

- Project: `inquiry-institute` (`370359270831`)
- VM: `matrix-synapse`, `us-central1-b`
- Disk: `matrix-synapse-migration`, 50 GB, auto-delete disabled
- Static address: `matrix-ip-central`, `136.64.21.139`
- Runtime service account: `matrix-synapse@inquiry-institute.iam.gserviceaccount.com`
- Public endpoint: `https://matrix.castalia.institute`

The prior project, `institute-481516`, is not a production target. Its terminated
`matrix-synapse` VM and disk are rollback-only assets.

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
   Matrix configuration and media store to
   `gs://inquiry-institute-matrix-backups`. The bucket has uniform access,
   object versioning, and a 21-day retention policy.

Install the checked-in units on the target VM:

```bash
sudo install -m 0750 infra/matrix/matrix-backup.sh /usr/local/sbin/matrix-backup
sudo install -m 0750 infra/matrix/validate-matrix-backup.sh /usr/local/sbin/validate-matrix-backup
sudo install -m 0644 infra/matrix/matrix-backup.service /etc/systemd/system/matrix-backup.service
sudo install -m 0644 infra/matrix/matrix-backup.timer /etc/systemd/system/matrix-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now matrix-backup.timer
sudo systemctl start matrix-backup.service
sudo /usr/local/sbin/validate-matrix-backup
```

Validation downloads the newest backup, verifies both checksums and archive
structure, restores the dump into an isolated temporary PostgreSQL 15 container,
reports user/room/event counts, and removes the validation container.

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
