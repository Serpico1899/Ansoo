# Plan 06 - Provenance, Assets, and Capture (v3.1)

**Status:** Not started
**Depends on:** 03
**Feeds:** 05 (evidence links), 09 (public evidence views)
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`
**Roadmap:** `00-roadmap.md`

## Purpose

Implement trustworthy provenance: Source identity, immutable SourceSnapshot captures, Asset metadata and
byte handling, content hashing, redaction lineage, evidence links, and an SSRF-safe fetcher. This plan makes
I08 executable and ensures served evidence has a traceable original.

## Non-Goals

- No publication decisions; evidence is cited by plans 05 and 09.
- No production object storage deployment; the provider interface must allow S3-compatible production.
- No aggregator dataset ingestion as published evidence.
- No malware scanner implementation beyond the interface and quarantine state.

## Pre-Flight

- [ ] Read spec Sections 8, 10.1, 12, 18.3, 18.5.
- [ ] Confirm models and caps from plan 03.
- [ ] Confirm the installed runtime APIs for hashing, MIME sniffing, file storage, and outbound fetch.
- [ ] Record the local storage root and the production provider interface.

## Tasks

### 1. Source identity

- [ ] Implement Source create/update/get/gets with strict validators.
- [ ] Enforce `sourceType`, `access`, `lifecycle`, `publisherVerified`, `attributionRequired`,
  `licenseCode` when ingesting datasets.
- [ ] Canonicalize URL per plan 04; keep original values where provenance requires them.
- [ ] No universal reliability score. Represent type, publisher, dates, limitations, and reasoning instead.
- [ ] `lastCapturedAt` is maintained from the latest snapshot; there is no `latestSnapshotId`.
- [ ] Reverse `recentSnapshotsPreview` is bounded and never used as a count or full history.

**Exit:** Source is an identity with no capture content and no reliability score.

### 2. Immutable SourceSnapshot capture

- [ ] Create capture action that writes a new snapshot and never overwrites an existing one.
- [ ] Required: `source`, `retrievedAt`, `contentHash`, `hashAlgorithm`, `captureMethod`,
  `acquisitionTier`, `lifecycle`, `createdAt`, `schemaVersion`.
- [ ] Optional: title/URL at capture, `publishedAt`, MIME, byte size, asset, capturer, metadata, supersedes
  links, redaction.
- [ ] Hash the **original bytes** with SHA-256; `hashAlgorithm = "SHA256"`.
- [ ] No `version` field and no mutable `updatedAt`; content identity fields are not correctable.
- [ ] A metadata correction creates a new snapshot with `supersedesSnapshotId`; the old document is untouched.
- [ ] EvidenceLinks stay pinned to the exact snapshot cited; supersession is advisory and displayed.
- [ ] Enforce `captureMetadata` allowlist, key cap, and depth <= 2.
- [ ] Reject any attempt to update contentHash, assetId, retrievedAt, or source on an existing snapshot.
- [ ] Audit `SNAPSHOT_CREATED` and `SNAPSHOT_SUPERSEDED`.

**Exit:** I08 and S09 pass; changed content always produces a new snapshot.

### 3. Redaction lineage

- [ ] Allow a redacted derivative asset with `redactedAssetId`, reason, redactedAt/By, method
  (`PIXEL`, `TEXT_REMOVAL`, `PAGE_REMOVAL`), and `originalRetained: true`.
- [ ] The original asset is always retained with restricted visibility.
- [ ] `contentHash` remains the original hash; served bytes may be redacted and the UI must disclose that.
- [ ] `REDACTED` is not a lifecycle value.
- [ ] Audit `SNAPSHOT_REDACTED`.
- [ ] A restricted snapshot never becomes public merely because a finding citing it is published.

**Exit:** redaction does not destroy provenance; public citation checks source/asset visibility separately.

### 4. Asset upload and metadata

- [ ] Implement provider interface: `LOCAL_DEV` and `S3_COMPATIBLE`.
- [ ] Store bytes outside MongoDB; store only metadata and object references.
- [ ] Sniff MIME from bytes; declared MIME and extension must match; enforce size/type allowlists.
- [ ] Enforce upload limit (5/day/user, 20 MiB) and content-hash dedup.
- [ ] Set `processingStatus` to `QUARANTINED` until validation/scanning; never serve quarantined or rejected
  bytes.
- [ ] EXIF and personal metadata stripped or reviewed before public use.
- [ ] `visibility` values: `PRIVATE`, `RESEARCH_ONLY`, `PUBLIC_APPROVED`.
- [ ] `legalHold` blocks purge; `retentionUntil` is metadata until the retention policy is decided.
- [ ] Never return bucket/object keys to a client.
- [ ] Audit `ASSET_UPLOADED`, `ASSET_SCAN_COMPLETED`, `ASSET_PURGED`.

**Exit:** S09 asset separation and S11 visibility tests pass; no bytes in Mongo.

### 5. Authorized delivery URLs

- [ ] Generate short-lived, tamper-resistant URLs for approved assets only.
- [ ] Reject tampered, expired, non-public, quarantined, or non-clean assets.
- [ ] Do not expose storage keys, bucket names, or internal paths.
- [ ] Respect `legalHold` and `DELETED_PENDING_PURGE`.
- [ ] Add tests for expiry, signature tampering, visibility changes, and legal hold.

**Exit:** a client can fetch only an approved asset and only through a short-lived URL.

### 6. SSRF-safe URL capture

- [ ] HTTPS required; port 443 only unless an ADR approves an exception.
- [ ] Block private, link-local, loopback, reserved, and cloud-metadata ranges (IPv4 and IPv6), including
  `169.254.169.254`, `::1`, `10/8`, `172.16/12`, `192.168/16`, `fc00::/7`.
- [ ] Resolve DNS and validate every address; revalidate after every redirect (anti-rebinding).
- [ ] Max 3 redirects, 10 seconds, 10 MiB.
- [ ] Never send ambient credentials (`credentials: "omit"` or equivalent).
- [ ] Reject URL credentials, non-HTTPS schemes, and non-443 ports.
- [ ] Pin the resolved IP at connect time, or use a hardened dispatcher, to close the DNS-rebinding TOCTOU.
- [ ] Record capture method, tier, and failure reason without leaking secrets.
- [ ] Tests: S29 with localhost, private IPv4/IPv6, metadata IP, DNS-to-private, redirect-to-private,
  redirect loop, oversized body, credentials, and non-HTTPS.

**Exit:** S29 passes for direct and redirect/DNS cases; no ambient credentials leave the service.

### 7. Evidence links

- [ ] Implement add/remove/review evidence link actions for Relationship and Claim.
- [ ] Validate `sourceSnapshotId` through the registry and confirm the snapshot exists.
- [ ] Store `stance` on the link, not the Source; enforce the enum.
- [ ] Enforce excerpt/rationale caps and locator shape.
- [ ] Appends use commutative append with a cap guard; removal uses CAS.
- [ ] Reject a public citation when the snapshot/source/asset is restricted.
- [ ] Set `addedBy` from auth; reviewedBy/reviewedAt from the reviewer action.
- [ ] Audit `EVIDENCE_ADDED`, `EVIDENCE_REMOVED`, `EVIDENCE_REVIEWED`.

**Exit:** S10 passes; evidence is pinned, stance is per link, and restricted evidence cannot leak.

### 8. Tests and report

- [ ] Tests: I08, S09, S10, S11 (asset/response visibility handoff if needed), S29.
- [ ] Negative tests: snapshot content rewrite, hash mismatch, MIME mismatch, oversized upload, quarantined
  download, restricted citation, redaction without original, SSRF variants.
- [ ] Write `reports/06-provenance-assets-and-capture.md`.

## Deliverables

1. Source identity actions.
2. Immutable snapshot capture with original-byte hashing and supersession.
3. Redaction lineage.
4. Asset storage interface, quarantine, MIME sniffing, EXIF handling, visibility, signed URLs.
5. Hardened SSRF-safe fetcher.
6. Evidence-link actions.
7. `reports/06-provenance-assets-and-capture.md`.

## Acceptance Criteria

1. I08 passes; a content-identity update is rejected.
2. Snapshot hash matches original bytes; redaction preserves the original and its hash.
3. Bytes stay outside MongoDB; object keys never reach clients.
4. Quarantined/rejected/private assets cannot be served.
5. S29 passes for direct addresses, redirects, DNS rebinding, and credential omission.
6. EvidenceLinks validate their snapshot and enforce visibility at citation time.

## Verification Commands

```bash
cd back
deno task fmt:check
deno task lint
deno task check
deno task test
```

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Snapshot content is edited in place | Service guards + DB privileges; content fields immutable |
| Redaction erases provenance | Original asset retained and restricted; hash of original |
| SSRF via redirect or DNS | Revalidate every hop; pin resolved IP at connect |
| MIME spoofing | Inspect bytes; match declared MIME and extension |
| Asset key leaks | Never return keys; signed short-lived URLs only |
| Local storage becomes production | Provider interface + explicit production checklist in plan 11 |
