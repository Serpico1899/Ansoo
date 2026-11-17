# Plan 03 - Models, Contracts, and Indexes (v3.1)

**Status:** Complete (2026-11-17)
**Depends on:** 02
**Blocks:** 04-09
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`
**Roadmap:** `00-roadmap.md`

## Purpose

Define the complete persistence model for the eleven canonical collections, the shared embedded contracts,
the hard caps, and the starting index set. This plan owns the schema boundary: later plans add behavior, not
new collections or fields without an ADR.

## Non-Goals

- No publication workflow, resolution algorithm, public profile, or data acquisition.
- No speculative collections (`categories`, `evidence_items`, `verification_cases`, `review_cases`).
- No unique indexes beyond the two explicitly allowed in spec Section 17.
- No benchmark-scale data yet; that is plan 11.

## Pre-Flight

- [x] Read spec Sections 3-10, 15-17, 24.
- [x] Read `summary.md` and the shared constants from plan 02.
- [x] Confirm how the installed Lesan version declares models, relations, embeds, and indexes.
- [x] Confirm canonical snake_case schema names map to the canonical collection names with no mapping layer.

## Tasks

### 1. Common types and metadata

- [x] `DocMeta`: `_id`, `schemaVersion`, `version`, `createdAt`, `updatedAt`, `createdBy?`, `updatedBy?`.
- [x] `Mergeable`: `lifecycle`, `mergedIntoId?`, `mergedAt?`, `mergedBy?`, `mergeReason?`.
- [x] `Validity`: `validFrom?`, `validTo?`, `datePrecision` (`EXACT`, `MONTH`, `YEAR`, `APPROXIMATE`,
  `UNKNOWN`). Half-open interval; unknown stays `null`.
- [x] `Alias`, `LocalizedName`, `IdentityProvenance`, `Sensitivity`.
- [x] Immutable documents (`source_snapshots`, `audit_events`) do not carry mutable `DocMeta` fields; snapshots
  have no `version`.
- [x] All dates are UTC BSON `Date`; all identifiers are strings.

**Exit:** common types exist once and are imported by every model.

### 2. Identity models

- [x] `products`: `name`, `normalizedName`, `matchKey`, `localizedNames?`, `description?`, `identifiers[]`,
  `categoryCode?`, `brand?` (Lesan single, optional), `brandMapping`, `identityProvenance?`, `packaging?`,
  typed `attributes?`, `Mergeable`, `DocMeta`.
- [x] `ProductIdentifier`: scheme, value, normalizedValue, matchValue?, jurisdiction?, issuer?, status,
  sourceSnapshotIds?, validFrom?, validTo?. GTIN kept as string; leading zeros preserved.
- [x] `ProductAttributeKey`: exactly `DECLARED_ORIGIN`, `INGREDIENTS_TEXT`, `MANUFACTURER_ON_PACKAGE`,
  `IMPORTER_ON_PACKAGE`, `NET_CONTENT_TEXT`.
- [x] `brands`: name/normalized/matchKey, localized names, aliases, description, website, logoAssetId,
  identityProvenance, `Mergeable`, `DocMeta`. **No `ownerId`.**
- [x] `organizations`: name/normalized/matchKey, localized names, kind, aliases, identifiers,
  legalProfile (registeredAddress access-controlled), website, operatingCountryCodes, identityProvenance,
  description, `Mergeable`, `DocMeta`.
- [x] `brandMapping`: status `UNREVIEWED`/`CANDIDATE`/`VERIFIED`/`DISPUTED`/`REJECTED`, candidateBrandId?,
  rationale?, reviewedAt?, reviewedBy?, evidenceSnapshotIds?.
- [x] `categoryCode` validates against `taxonomy.v1.json`; no Category document.
- [x] Multi-brand and multi-category are rejected explicitly in the MVP, not overloaded.

**Exit:** identity documents match spec Sections 5.1-5.3 exactly, including the absence of Brand ownership.

### 3. Graph and research models

- [x] `relationships`: `subject`, `predicate`, `predicateRegistryVersion`, `object`, `context`, `validity`,
  `sensitivity`, `recordLifecycle`, `review`, `assessment`, `publication`, `publicationGate?`,
  `publicWording?`, `evidence[]`, `organizationResponses[]`, `responseSolicitations[]`, `researchNotes[]`,
  `recentRevisionPreview[]`, `canonicalKey?`, `recordedAt`, `DocMeta`.
- [x] `claims`: `about`, `relatedEntities?` (<=10), `claimType`, `claimTypeRegistryVersion`, `statement`,
  `publicWording?`, `localizedStatements?`, `structuredValue`, `scope?`, `sensitivity`, `recordLifecycle`,
  `review`, `assessment`, `publication`, `publicationGate?`, embedded contracts, `recordedAt`, `DocMeta`.
- [x] Enforce predicate endpoint matrix and required context at the validator boundary:
  `OWNS` (ORG -> ORG|BRAND), `CONTROLS` (ORG -> ORG|BRAND, basis), `MANUFACTURES` (ORG -> PRODUCT),
  `DISTRIBUTES` (ORG -> PRODUCT|BRAND, market), `IMPORTS_TO_MARKET` (ORG -> PRODUCT, market).
- [x] `ClaimStructuredValue` is a discriminated union of exactly the three claim types.
- [x] `canonicalKey` is a helper only; no unique index.
- [x] `predicateRegistryVersion` and `claimTypeRegistryVersion` start at `1`.

**Exit:** models represent only v3.1 predicates/claim types; no `SUBSIDIARY_OF`, `OTHER_*`, or free JSON.

### 4. Provenance models

- [x] `sources`: title, canonicalUrl?, sourceType, publisherName?, publisherOrganizationId?,
  publisherVerified, language?, countryCode?, jurisdiction?, access, usageTerms?, licenseCode?,
  attributionRequired, lifecycle, lastCapturedAt?, `DocMeta`. No reliability score, no `latestSnapshotId`.
- [x] `source_snapshots`: `source` (Lesan single, required), titleAtCapture?, canonicalUrlAtCapture?,
  publishedAt?, retrievedAt, contentHash, hashAlgorithm, mimeType?, byteSize?, assetId?, captureMethod,
  acquisitionTier, capturedBy?, captureMetadata?, supersedesSnapshotId?, supersededBySnapshotId?,
  redaction?, lifecycle, schemaVersion, createdAt. No `version`, no mutable `updatedAt`.
- [x] `contentHash` hashes the original bytes; redaction is lineage, not a content rewrite.
- [x] `assets`: storage `{provider, bucket?, objectKey}`, names, MIME, size, sha256, processingStatus,
  visibility, uploader/time, malwareScan?, exifStripped, retentionUntil?, legalHold, lifecycle, version,
  schemaVersion.
- [x] Bytes never appear in MongoDB; only metadata and references.

**Exit:** source/snapshot/asset boundaries match spec Section 8; snapshot immutability is representable.

### 5. Governance models

- [x] `corrections`: optional `target`, `submissionKind`, `proposedChange?`, `reason`, evidenceReferences[],
  submitter/time, unique `idempotencyKey`, status, review, application ledger.
- [x] `users`: authProvider/authSubject, private email/phone, displayName, preferredLocale, roles,
  trustLevel, accountStatus, lastActiveAt, `DocMeta`.
- [x] `audit_events`: immutable, actor, action, target, request/correlation id, idempotencyKey?,
  version before/after, changedPaths?, flat before/after summaries, reason?, occurredAt,
  eventSchemaVersion.
- [x] Audit summaries forbid nested values/arrays and never include email, phone, authSubject,
  passwordHash, registeredAddress, research note bodies, tokens, or full documents.

**Exit:** status/prompt/audit shapes match spec Section 9 and cannot carry a verdict or secret.

### 6. Shared embedded contracts

Implement and validate each embedded contract from spec Section 10:

- [x] `EvidenceLink` with cap-limited excerpt/rationale and explicit stance.
- [x] `ReviewWorkflow` with queue status, assignee, priority, timestamps.
- [x] `EvidenceAssessment` with outcome, assessor, methodologyVersion, limitations.
- [x] `PublicationState` with status/decider/dates/reason; no `visibilityScope`.
- [x] `PublicationGate` with gate version, checks, result, failures, waivers; non-waivable checks enforced in
  the service.
- [x] `ResponseSolicitation` with channel, sentAt, assertionsSummary, deadline, outcome, proof asset,
  response link.
- [x] `OrganizationResponse` with respondent, text cap, verification, publication status, attachments,
  solicitation link.
- [x] `ResearchNote` with visibility restricted to internal/legal/admin.
- [x] `RevisionPreview` bounded and not a substitute for audit history.
- [x] `PublicCorrectionNotice` shape reserved for plan 09.

**Exit:** all contracts are defined once and reused; caps are attached to the field, not to prose.

### 7. Validators and caps

- [x] Enforce every cap from spec Section 4.5 in the action validators.
- [x] Return `422 CAP_EXCEEDED`; never silently slice or discard.
- [x] Enforce unique values inside one document for embedded arrays where required by service policy.
- [x] Enforce `captureMetadata` allowlist, key count, and depth <= 2.
- [x] Reject unknown keys where the domain is closed (predicates, claim types, statuses, audit actions).
- [x] Reject `version`, `_id`, `createdAt`, and `createdBy` in any update patch.

**Exit:** I14 passes; no cap is enforced only in documentation.

### 8. Lesan relation boundary

- [x] `Product.brand` -> Brand, single, optional; reverse `Brand.productsPreview` limit 20, sort `updatedAt`
  desc.
- [x] `SourceSnapshot.source` -> Source, single, required; reverse `Source.recentSnapshotsPreview` limit 10,
  sort `retrievedAt` desc.
- [x] No other Lesan relation, including `Product.category`.
- [x] Treat `{}` or missing `_id` as absent.
- [x] Use `updateRelations`/domain actions only; never raw-update embedded snapshots.
- [x] Do not use `hardCascade`.

**Exit:** exactly two relations exist and reverse fields are named `*Preview`.

### 9. Starting indexes

Create indexes only after naming a real query; verify each with `explain("executionStats")`.

- [x] Products: identifier composite, matchValue, matchKey, brand+lifecycle, categoryCode+lifecycle.
- [x] Brands: matchKey, aliases.matchKey, lifecycle+updatedAt.
- [x] Organizations: matchKey, identifier composite, kind+lifecycle.
- [x] Relationships: subject, object, review queue (global and assignee), publication, market+predicate.
- [x] Claims: about, review queue, publication.
- [x] Sources: canonicalUrl, sourceType+lifecycle.
- [x] Snapshots: source+retrievedAt, contentHash.
- [x] Corrections: status+submittedAt, submitter+submittedAt, target+status, unique sparse application
  idempotency key.
- [x] Audit: target+occurredAt, actor+occurredAt, correlationId.
- [x] Profiles: unique productId (created in plan 09).
- [x] No unique index on identifiers, aliases, matchKey, canonicalUrl, or canonicalKey.

**Exit:** Stage Gate C evidence exists for every created index; no collection scan on a core query.

### 10. Verification and report

- [x] Run all verification commands.
- [x] Record model/collection names, created indexes, explain summaries, and BSON sizes of representative
  Relationship/Claim documents.
- [x] Write `reports/03-models-contracts-and-indexes.md`.
- [x] Record any schema decision that needs an ADR before implementation continues.

## Deliverables

1. Eleven production models with exact v3.1 fields and embedded contracts.
2. Cap-enforcing validators and closed enums.
3. Two Lesan relations only, with bounded reverse previews.
4. Verified starting indexes and Stage Gate C evidence.
5. `reports/03-models-contracts-and-indexes.md`.

## Acceptance Criteria

1. Exactly 11 domain collections exist; no `categories` or speculative collection (the read model arrives
   in plan 09).
2. No Brand owner field, no score field, no `visibilityScope`, no source `latestSnapshotId`, no snapshot
   `version`, no free-form product attributes.
3. Exactly 2 relations, 5 predicates, and 3 claim types are representable.
4. Every cap returns `422 CAP_EXCEEDED`.
5. Every starting index has a named query and an `explain` result.
6. I14 passes; snapshot immutability and audit append-only are structurally representable.

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
| Old fields leak back in from the scaffold or spike | Diff every model against spec Sections 5-9; grep for forbidden names |
| Caps are enforced only in docs | Validator tests for each cap and each boundary value |
| A unique index blocks real data | Only the two allowed unique indexes; document rationale for others |
| Embedded documents approach 1 MiB | Measure representative BSON; cap evidence at 50 per spec; split before 1 MiB |
| Relation snapshots are misused as authoritative | Name reverse fields `*Preview`; query owning collections |
