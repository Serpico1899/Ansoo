# Agent Prompt - Execute Plan 06 (Provenance, Assets, and Capture)

Read `README.md` here, then `../plans/06-provenance-assets-and-capture.md`, spec Sections 8, 10.1, 12,
18.3, 18.5, and plan 03.

## Mission

Make evidence traceable: Source identity, immutable snapshots, original-byte hashing, asset metadata and
safe delivery, redaction lineage, evidence links, and an SSRF-safe fetcher.

## Sequence

1. **Sources:** create/update/get; source type/access/lifecycle/publisher/license; canonical URL; no
   reliability score; `lastCapturedAt` only; bounded snapshot preview.
2. **Snapshots:** new document per capture; original-byte SHA-256; no `version`; immutable content fields;
   metadata correction = new snapshot with `supersedesSnapshotId`.
3. **Redaction:** derivative asset + reason/method/reviewer; original retained and restricted; hash stays
   original; public disclosure.
4. **Assets:** provider interface; bytes outside Mongo; MIME sniffing; size/type allowlists; quarantine;
   EXIF strip; visibility; legal hold; no object keys to clients.
5. **Delivery:** short-lived signed URLs; reject expired/tampered/quarantined/private assets.
6. **SSRF:** HTTPS/443, private/reserved/metadata blocks (IPv4+IPv6), DNS and redirect revalidation, caps
   (3 redirects, 10 s, 10 MiB), no ambient credentials, pin resolved IP at connect.
7. **Evidence:** add/remove/review; snapshot registry validation; stance on the link; caps; commutative
   append; restricted citation rejection; audit.
8. **Tests/report:** I08, S09, S10, S29; write `../reports/06-provenance-assets-and-capture.md`.

## Do Not

- Do not store bytes/base64 in MongoDB.
- Do not mutate snapshot content identity or `contentHash`.
- Do not serve quarantined/private/rejected assets.
- Do not expose storage keys or buckets.
- Do not send credentials or follow redirects to private addresses.
- Do not treat a published finding as permission to expose a restricted snapshot.

## Evidence Required

- Snapshot immutability and hash-match tests.
- Asset MIME/size/quarantine/signed-URL negative tests.
- SSRF matrix including redirect and DNS rebinding.
- Restricted-citation rejection.
- Verification logs.

## Stop Conditions

Stop if the runtime cannot safely pin DNS/redirects, if object storage cannot preserve original bytes, or
if a licensing/retention decision is required.
