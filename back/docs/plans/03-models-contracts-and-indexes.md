# Plan 03 - Models, Contracts, and Indexes (v3.1)

**Status:** Not started
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

- [ ] Read spec Sections 3-10, 15-17, 24.
- [ ] Read `summary.md` and the shared constants from plan 02.
- [ ] Confirm how the installed Lesan version declares models, relations, embeds, and indexes.
- [ ] Confirm canonical snake_case schema names map to the canonical collection names with no mapping layer.

## Tasks

### 1. Common types and metadata

- [ ] `DocMeta`: `_id`, `schemaVersion`, `version`, `createdAt`, `updatedAt`, `createdBy?`, `updatedBy?`.
- [ ] `Mergeable`: `lifecycle`, `mergedIntoId?`, `mergedAt?`, `mergedBy?`, `mergeReason?`.
- [ ] `Validity`: `validFrom?`, `validTo?`, `datePrecision` (`EXACT`, `MONTH`, `YEAR`, `APPROXIMATE`,
  `UNKNOWN`). Half-open interval; unknown stays `null`.
- [ ] `Alias`, `LocalizedName`, `IdentityProvenance`, `Sensitivity`.
- [ ] Immutable documents (`source_snapshots`, `audit_events`) do not carry mutable `DocMeta` fields; snapshots
  have no `version`.
- [ ] All dates are UTC BSON `Date`; all identifiers are strings.

**Exit:** common types exist once and are imported by every model.

### 2. Identity models

- [ ] `products`: `name`, `normalizedName`, `matchKey`, `localizedNames?`, `description?`, `identifiers[]`,
  `categoryCode?`, `brand?` (Lesan single, optional), `brandMapping`, `identityProvenance?`, `packaging?`,
  typed `attributes?`, `Mergeable`, `DocMeta`.
- [ ] `ProductIdentifier`: scheme, value, normalizedValue, matchValue?, jurisdiction?, issuer?, status,
  sourceSnapshotIds?, validFrom?, validTo?. GTIN kept as string; leading zeros preserved.
- [ ] `ProductAttributeKey`: exactly `DECLARED_ORIGIN`, `INGREDIENTS_TEXT`, `MANUFACTURER_ON_PACKAGE`,
  `IMPORTER_ON_PACKAGE`, `NET_CONTENT_TEXT`.
- [ ] `brands`: name/normalized/matchKey, localized names, aliases, description, website, logoAssetId,
  identityProvenance, `Mergeable`, `DocMeta`. **No `ownerId`.**
- [ ] `organizations`: name/normalized/matchKey, localized names, kind, aliases, identifiers,
  legalProfile (registeredAddress access-controlled), website, operatingCountryCodes, identityProvenance,
  description, `Mergeable`, `DocMeta`.
- [ ] `brandMapping`: status `UNREVIEWED`/`CANDIDATE`/`VERIFIED`/`DISPUTED`/`REJECTED`, candidateBrandId?,
  rationale?, reviewedAt?, reviewedBy?, evidenceSnapshotIds?.
- [ ] `categoryCode` validates against `taxonomy.v1.json`; no Category document.
- [ ] Multi-brand and multi-category are rejected explicitly in the MVP, not overloaded.

**Exit:** identity documents match spec Sections 5.1-5.3 exactly, including the absence of Brand ownership.

### 3. Graph and research models

- [ ] `relationships`: `subject`, `predicate`, `predicateRegistryVersion`, `object`, `context`, `validity`,
  `sensitivity`, `recordLifecycle`, `review`, `assessment`, `publication`, `publicationGate?`,
  `publicWording?`, `evidence[]`, `organizationResponses[]`, `responseSolicitations[]`, `researchNotes[]`,
  `recentRevisionPreview[]`, `canonicalKey?`, `recordedAt`, `DocMeta`.
- [ ] `claims`: `about`, `relatedEntities?` (<=10), `claimType`, `claimTypeRegistryVersion`, `statement`,
  `publicWording?`, `localizedStatements?`, `structuredValue`, `scope?`, `sensitivity`, `recordLifecycle`,
  `review`, `assessment`, `publication`, `publicationGate?`, embedded contracts, `recordedAt`, `DocMeta`.
- [ ] Enforce predicate endpoint matrix and required context at the validator boundary:
  `OWNS` (ORG -> ORG|BRAND), `CONTROLS` (ORG -> ORG|BRAND, basis), `MANUFACTURES` (ORG -> PRODUCT),
  `DISTRIBUTES` (ORG -> PRODUCT|BRAND, market), `IMPORTS_TO_MARKET` (ORG -> PRODUCT, market).
- [ ] `ClaimStructuredValue` is a discriminated union of exactly the three claim types.
- [ ] `canonicalKey` is a helper only; no unique index.
- [ ] `predicateRegistryVersion` and `claimTypeRegistryVersion` start at `1`.

**Exit:** models represent only v3.1 predicates/claim types; no `SUBSIDIARY_OF`, `OTHER_*`, or free JSON.

### 4. Provenance models

- [ ] `sources`: title, canonicalUrl?, sourceType, publisherName?, publisherOrganizationId?,
  publisherVerified, language?, countryCode?, jurisdiction?, access, usageTerms?, licenseCode?,
  attributionRequired, lifecycle, lastCapturedAt?, `DocMeta`. No reliability score, no `latestSnapshotId`.
- [ ] `source_snapshots`: `source` (Lesan single, required), titleAtCapture?, canonicalUrlAtCapture?,
  publishedAt?, retrievedAt, contentHash, hashAlgorithm, mimeType?, byteSize?, assetId?, captureMethod,
  acquisitionTier, capturedBy?, captureMetadata?, supersedesSnapshotId?, supersededBySnapshotId?,
  redaction?, lifecycle, schemaVersion, createdAt. No `version`, no mutable `updatedAt`.
- [ ] `contentHash` hashes the original bytes; redaction is lineage, not a content rewrite.
- [ ] `assets`: storage `{provider, bucket?, objectKey}`, names, MIME, size, sha256, processingStatus,
  visibility, uploader/time, malwareScan?, exifStripped, retentionUntil?, legalHold, lifecycle, version,
  schemaVersion.
- [ ] Bytes never appear in MongoDB; only metadata and references.

**Exit:** source/snapshot/asset boundaries match spec Section 8; snapshot immutability is representable.

### 5. Governance models

- [ ] `corrections`: optional `target`, `submissionKind`, `proposedChange?`, `reason`, evidenceReferences[],
  submitter/time, unique `idempotencyKey`, status, review, application ledger.
- [ ] `users`: authProvider/authSubject, private email/phone, displayName, preferredLocale, roles,
  trustLevel, accountStatus, lastActiveAt, `DocMeta`.
- [ ] `audit_events`: immutable, actor, action, target, request/correlation id, idempotencyKey?,
  version before/after, changedPaths?, flat before/after summaries, reason?, occurredAt,
  eventSchemaVersion.
- [ ] Audit summaries forbid nested values/arrays and never include email, phone, authSubject,
  passwordHash, registeredAddress, research note bodies, tokens, or full documents.

**Exit:** status/prompt/audit shapes match spec Section 9 and cannot carry a verdict or secret.

### 6. Shared embedded contracts

Implement and validate each embedded contract from spec Section 10:

- [ ] `EvidenceLink` with cap-limited excerpt/rationale and explicit stance.
- [ ] `ReviewWorkflow` with queue status, assignee, priority, timestamps.
- [ ] `EvidenceAssessment` with outcome, assessor, methodologyVersion, limitations.
- [ ] `PublicationState` with status/decider/dates/reason; no `visibilityScope`.
- [ ] `PublicationGate` with gate version, checks, result, failures, waivers; non-waivable checks enforced in
  the service.
- [ ] `ResponseSolicitation` with channel, sentAt, assertionsSummary, deadline, outcome, proof asset,
  response link.
- [ ] `OrganizationResponse` with respondent, text cap, verification, publication status, attachments,
  solicitation link.
- [ ] `ResearchNote` with visibility restricted to internal/legal/admin.
- [ ] `RevisionPreview` bounded and not a substitute for audit history.
- [ ] `PublicCorrectionNotice` shape reserved for plan 09.

**Exit:** all contracts are defined once and reused; caps are attached to the field, not to prose.

### 7. Validators and caps

- [ ] Enforce every cap from spec Section 4.5 in the action validators.
- [ ] Return `422 CAP_EXCEEDED`; never silently slice or discard.
- [ ] Enforce unique values inside one document for embedded arrays where required by service policy.
- [ ] Enforce `captureMetadata` allowlist, key count, and depth <= 2.
- [ ] Reject unknown keys where the domain is closed (predicates, claim types, statuses, audit actions).
- [ ] Reject `version`, `_id`, `createdAt`, and `createdBy` in any update patch.

**Exit:** I14 passes; no cap is enforced only in documentation.

### 8. Lesan relation boundary

- [ ] `Product.brand` -> Brand, single, optional; reverse `Brand.productsPreview` limit 20, sort `updatedAt`
  desc.
- [ ] `SourceSnapshot.source` -> Source, single, required; reverse `Source.recentSnapshotsPreview` limit 10,
  sort `retrievedAt` desc.
- [ ] No other Lesan relation, including `Product.category`.
- [ ] Treat `{}` or missing `_id` as absent.
- [ ] Use `updateRelations`/domain actions only; never raw-update embedded snapshots.
- [ ] Do not use `hardCascade`.

**Exit:** exactly two relations exist and reverse fields are named `*Preview`.

### 9. Starting indexes

Create indexes only after naming a real query; verify each with `explain("executionStats")`.

- [ ] Products: identifier composite, matchValue, matchKey, brand+lifecycle, categoryCode+lifecycle.
- [ ] Brands: matchKey, aliases.matchKey, lifecycle+updatedAt.
- [ ] Organizations: matchKey, identifier composite, kind+lifecycle.
- [ ] Relationships: subject, object, review queue (global and assignee), publication, market+predicate.
- [ ] Claims: about, review queue, publication.
- [ ] Sources: canonicalUrl, sourceType+lifecycle.
- [ ] Snapshots: source+retrievedAt, contentHash.
- [ ] Corrections: status+submittedAt, submitter+submittedAt, target+status, unique sparse application
  idempotency key.
- [ ] Audit: target+occurredAt, actor+occurredAt, correlationId.
- [ ] Profiles: unique productId (created in plan 09).
- [ ] No unique index on identifiers, aliases, matchKey, canonicalUrl, or canonicalKey.

**Exit:** Stage Gate C evidence exists for every created index; no collection scan on a core query.

### 10. Verification and report

- [ ] Run all verification commands.
- [ ] Record model/collection names, created indexes, explain summaries, and BSON sizes of representative
  Relationship/Claim documents.
- [ ] Write `reports/03-models-contracts-and-indexes.md`.
- [ ] Record any schema decision that needs an ADR before implementation continues.

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
