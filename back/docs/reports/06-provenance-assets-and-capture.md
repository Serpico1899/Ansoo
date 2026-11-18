# Plan 06 - Provenance, Assets, and Capture (v3.1) - Report

**Status:** Complete (2026-11-18)
**Plan:** `docs/plans/06-provenance-assets-and-capture.md`
**Canonical contract:** `../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` (CT-DOMAIN-SPEC v3.1)
**Evidence:** `docs/reports/evidence/06-provenance-assets-and-capture/`

## 1. Environment

| Item              | Value                                                       |
| ----------------- | ----------------------------------------------------------- |
| OS                | Linux 7.0.0-43-generic (x86_64)                             |
| Runtime           | Deno 2.4.5 (V8 13.7)                                        |
| Backend framework | Lesan 0.2.3 (`jsr:@hemedani/lesan@0.2.3`)                   |
| Database          | MongoDB 8.0.13, single-node replica set `rs0` on port 27019 |
| Test databases    | `ansoo_plan06_*` (created and dropped by each run)          |

Commands used:

```bash
deno task db:dev
deno task fmt:check
deno task lint
deno task check
RUN_MONGO_TESTS=1 deno test --allow-all tests/provenance/
RUN_MONGO_TESTS=1 deno task test
```

## 2. Results by task

### Task 1 - Source identity

**Pass.** `utils/provenance/source.ts` implements authorized create/update/get/list with strict unknown-key
rejection. It enforces the `SOURCE_TYPES`, `SOURCE_ACCESS`, and `SOURCE_LIFECYCLE` registries,
`publisherVerified`, `attributionRequired`, and a `licenseCode` for `DATASET`. URLs pass through the plan-04
canonicalizer. Sources store no reliability score and no `latestSnapshotId`. `lastCapturedAt` is updated
only when a newer retrieval time arrives. `getSource` supports a `recentSnapshotsPreview` bounded to 10 and
ordered newest first; it is never presented as a count or full history. Evidence:
`capture.integration.test.ts`, `test-provenance.log`.

### Task 2 - Immutable SourceSnapshot capture

**Pass.** `captureSnapshot` always inserts a new `source_snapshots` document. It writes `source`,
`retrievedAt`, `contentHash`, `hashAlgorithm = "SHA256"`, `captureMethod`, `acquisitionTier`, `lifecycle`,
`createdAt`, and `schemaVersion`; optional fields cover title/URL at capture, publish date, MIME, byte size,
asset, capturer, metadata, supersession, and redaction. Original bytes are hashed with SHA-256. There is no
`version` or mutable `updatedAt`. `updateSnapshotContent` rejects even attempts to patch `contentHash`,
`assetId`, `retrievedAt`, or `source`. A metadata correction creates a new snapshot with
`supersedesSnapshotId` while the old document is untouched. `captureMetadata` uses the shared allowlist/key
cap/depth validator. `SNAPSHOT_CREATED` and `SNAPSHOT_SUPERSEDED` are audited. Evidence:
`capture.integration.test.ts`, I08/S09.

### Task 3 - Redaction lineage

**Pass.** `redactSnapshot` requires a retained original asset and a derivative that is `READY` and
`PUBLIC_APPROVED`. It sets the original asset to `PRIVATE`, stores `redaction` with `redactedAssetId`,
`reason`, `redactedAt`, `redactedBy`, a registry `method`, and `originalRetained: true`, and audits
`SNAPSHOT_REDACTED`. `contentHash` remains the original hash. `REDACTED` is not used as a lifecycle.
`snapshotDisclosure` returns the original hash, redaction state, and the served derivative id so a public
view can disclose that bytes were redacted. Evidence: `capture.integration.test.ts`, S09.

### Task 4 - Asset upload and metadata

**Pass.** `provider.ts` defines the object-storage interface with `LOCAL_DEV` (filesystem) and
`S3_COMPATIBLE` (SigV4, HTTPS endpoint). Mongo stores only metadata and internal storage references. MIME is
sniffed from bytes and must match the declared type and extension; unsupported types fail closed. Uploads are
capped at 20 MiB and 5 per user per UTC day, and content hashes are deduplicated. New assets start
`QUARANTINED`; a scan can move them to `READY` or `REJECTED`. EXIF/personal metadata is reviewed before
`PUBLIC_APPROVED`. Visibility is exactly `PRIVATE`, `RESEARCH_ONLY`, or `PUBLIC_APPROVED`. `legalHold`
blocks purge, while `retentionUntil` remains metadata for the retention scheduler (spec 12).
`ASSET_UPLOADED`, `ASSET_SCAN_COMPLETED`, and `ASSET_PURGED` are audited. `clientAssetView` never includes a
bucket or object key. Evidence: `capture.integration.test.ts`, S09/S11.

### Task 5 - Authorized delivery URLs

**Pass.** `delivery.ts` creates HMAC-SHA256 signed URLs bound to the asset id and expiry, with a maximum TTL
of one hour. Verification rejects invalid, expired, or tampered signatures; assets that are not `READY`,
`PUBLIC_APPROVED`, `ACTIVE`, EXIF-reviewed, and `CLEAN`; and `DELETED_PENDING_PURGE` via the lifecycle check.
The URL contains no bucket, object key, or path. `resolveSignedAsset` rechecks metadata, reads bytes through
the provider, and rejects a stored-byte hash mismatch. `legalHold` does not change delivery; it only blocks
purge, matching spec 12. Evidence: `capture.integration.test.ts`.

### Task 6 - SSRF-safe URL capture

**Pass.** `fetcher.ts` accepts HTTPS only, port 443 only, no URL credentials, and no blocked hostnames. It
classifies IPv4 and IPv6 addresses, including loopback, private, link-local, CGNAT, documentation, benchmark,
multicast, reserved, mapped IPv4, NAT64, and cloud-metadata ranges. DNS answers are all validated before
connect. The default transport connects to the validated address with TLS SNI for the hostname, and every
redirect repeats URL, DNS, and address validation. Redirects are capped at 3, time at 10 seconds, and body at
10 MiB. Redirect loops, non-HTTPS redirects, oversized bodies, non-2xx responses, and resolver failures fail
closed. The transport sends no cookies or ambient credentials. Evidence: `fetcher.test.ts`, S29.

### Task 7 - Evidence links

**Pass.** `evidence.ts` supports add/remove/review for both Claims and Relationships. Snapshot ids resolve
through the closed registry, and the snapshot must be `AVAILABLE`; its source must not be archived, and
`RESTRICTED`/`INTERNAL` sources are rejected with `RESTRICTED_CITATION`. Stance is stored per link and
validated against the enum. Excerpt/rationale caps and locator shape are enforced. Adds use an atomic
commutative pipeline append guarded by the evidence cap and duplicate snapshot check; optional expected
version adds compare-and-set when callers need it. Removals and reviews use compare-and-set.
`addedBy` comes from the authenticated actor; `reviewedBy`/`reviewedAt` come from the reviewer action.
`EVIDENCE_ADDED`, `EVIDENCE_REMOVED`, and `EVIDENCE_REVIEWED` are audited. Evidence:
`evidence.integration.test.ts`, S10.

### Task 8 - Tests and report

**Pass.** Provenance tests cover I08, S09, S10, S11 handoff assumptions, and S29. Negative cases include
snapshot content rewrite, asset/snapshot hash mismatch, stored-byte tampering, MIME mismatch, extension
mismatch through MIME, oversized upload, quarantined delivery, expired/tampered signed URLs, visibility
changes, legal-hold purge, redaction without an original, restricted citation, duplicates, version races,
unauthorized actors, SSRF literals, private DNS, redirect-to-private, non-HTTPS redirects, redirect loops,
redirect/size/timeout caps, and non-2xx responses.

## 3. Decisions

1. **Domain services now, HTTP triads in plan 08.** The provenance services accept a server-controlled actor
   and enforce roles, caps, history, and audit. Plan 08 wraps them in Lesan actions.
2. **Object storage is provider-bound.** `LOCAL_DEV` is the development provider; `S3_COMPATIBLE` is
   configuration-bound and HTTPS-only. No production bucket is deployed here.
3. **Snapshots are immutable.** Metadata corrections and supersession always create a new snapshot. Nothing
   patches content identity.
4. **Redaction keeps provenance.** The original asset is retained and restricted, the derivative is served,
   and `contentHash` remains the original hash.
5. **Signed URLs carry no storage identity.** Delivery is an asset-id HMAC URL; the provider lookup happens
   server-side and is hash-checked on read.
6. **`legalHold` and `retentionUntil` do not change delivery.** `legalHold` blocks purge; `retentionUntil` is
   metadata until the retention scheduler is implemented.
7. **Evidence adds are commutative.** A new link is appended atomically under a cap guard, so concurrent
   additions do not lose data. Removals and reviews remain compare-and-set.
8. **Restricted evidence cannot be cited.** A `RESTRICTED` or `INTERNAL` source is rejected before a link is
   written.

## 4. Measurements

| Measurement | Result |
| --- | --- |
| Provenance test run | 8 passed (17 steps), 0 failed |
| Full unit/invariant/integration run | 115 passed (106 steps), 0 failed, 10 ignored |
| Asset upload cap | 5 per user per UTC day |
| Asset byte cap | 20 MiB |
| Signed URL max TTL | 1 hour |
| SSRF redirect cap | 3 |
| SSRF timeout | 10 seconds |
| SSRF body cap | 10 MiB |
| Evidence cap | 50 per finding |

The 10 ignored tests on the default run are pre-existing Mongo-gated cases; all integration suites ran with
`RUN_MONGO_TESTS=1`.

## 5. Security negative tests

- A snapshot content-identity patch, including `contentHash`, `assetId`, `retrievedAt`, or `source`, fails
  with `409 SNAPSHOT_IMMUTABLE`.
- Snapshot/asset hash mismatch and stored-byte tampering fail closed.
- MIME spoofing, unsupported types, oversized uploads, and daily quota exhaustion are rejected.
- Quarantined, rejected, private, research-only, deleted, and non-clean assets cannot be delivered.
- Expired and tampered signed URLs are rejected; visibility changes invalidate existing URLs immediately.
- Redaction without a retained original is rejected; the original is never public.
- Restricted/internal sources cannot be cited as evidence.
- Evidence duplicates, version races, and unauthorized actors are rejected without partial writes.
- SSRF attempts via literals, private DNS, redirects, rebinding, non-HTTPS redirects, URL credentials, and
  non-443 ports fail before a request can reach the target.
- Caps return `422 CAP_EXCEEDED`; nothing is silently truncated.

Evidence: `test-provenance.log`, `test-mongo.log`.

## 6. Blocked/open items

- The default `denoPinnedTransport` raw TLS path is implemented but not exercised against a live public
  host in this environment. The SSRF matrix runs through the injectable transport; a live-network smoke test
  belongs to plan 11.
- Plan 07/11 owns the retention scheduler that purges `DELETED_PENDING_PURGE` assets after
  `retentionUntil`.
- Plan 08 must wrap these services in HTTP triads and inject the authenticated actor. Plan 09 owns the
  public evidence projection.

## 7. Files changed

Production:

- `utils/provenance/common.ts`, `source.ts`, `provider.ts`, `asset.ts`, `snapshot.ts`, `delivery.ts`,
  `fetcher.ts`, `evidence.ts`, `mod.ts`
- `utils/mod.ts` (exports `provenance` namespace)

Tests and evidence:

- `tests/provenance/fetcher.test.ts`, `capture.integration.test.ts`, `evidence.integration.test.ts`
- `docs/reports/evidence/06-provenance-assets-and-capture/`

Documentation:

- `docs/plans/06-provenance-assets-and-capture.md` (status)
- `docs/summary.md` (status)
- `docs/reports/README.md` (index)

No models, generated declarations, frontend files, or archive files were changed.

## 8. Verification

| Command | Result | Evidence |
| --- | --- | --- |
| `deno task fmt:check` | Pass, 93 files checked | `fmt-check.log` |
| `deno task lint` | Pass, 92 files checked | `lint.log` |
| `deno task check` | Pass | `check.log` |
| Provenance tests (Mongo) | 8 passed (17 steps), 0 failed | `test-provenance.log` |
| `deno task test` (Mongo) | 115 passed (106 steps), 0 failed, 10 ignored | `test-mongo.log` |
