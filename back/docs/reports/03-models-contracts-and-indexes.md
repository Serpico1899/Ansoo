# Plan 03 - Models, Contracts, and Indexes (v3.1) - Report

**Status:** Complete (2026-11-17) **Plan:** `docs/plans/03-models-contracts-and-indexes.md`
**Canonical contract:** `../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` (CT-DOMAIN-SPEC v3.1)
**Evidence:** `docs/reports/evidence/03-models-contracts-and-indexes/`

## 1. Environment

| Item              | Value                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| OS                | Ubuntu 24.04.2 LTS (x86_64)                                               |
| Runtime           | Deno 2.4.5                                                                |
| Backend framework | Lesan 0.2.3 (`jsr:@hemedani/lesan@0.2.3`, `deno.lock`)                    |
| Database          | MongoDB 8.0.13, single-node replica set `rs0` on port 27019               |
| Test databases    | `ansoo_plan03_indexes`, `ansoo_plan03_relations` (dropped after each run) |

Commands used:

```bash
deno task db:dev
deno task fmt
deno task fmt:check
deno task lint
deno task check
deno task test
RUN_MONGO_TESTS=1 deno test --allow-all \
  tests/models/relations.integration.test.ts \
  tests/models/indexes.integration.test.ts
```

## 2. Results by task

### Task 1 - Common types and metadata

**Pass.** `models/shared.ts` defines `DocMeta`, `Mergeable`, `Validity`, `Alias`, `LocalizedName`,
`IdentityProvenance`, and `Sensitivity` once. All eleven models import them. `source_snapshots` uses
`createdAt`/`schemaVersion` only (no `version`, no mutable `updatedAt`); `audit_events` is similarly
immutable. Dates and identifiers are BSON `Date` and strings. Evidence: `common.test.ts`,
`models/*.ts`.

### Task 2 - Identity models

**Pass.** `products`, `brands`, and `organizations` match spec Sections 5.1-5.3 using closed
vocabularies and typed embedded arrays. Product identifiers remain strings, including GTIN with
leading zeros. Product attributes use the five `ProductAttributeKey` values; there is no free-form
attribute map. `brandMapping` uses the five declared statuses. `categoryCode` is validated against
`taxonomy.v1.json`; there is no Category document or relation. Brand has no ownership field.
Multi-brand and multi-category inputs are rejected. Evidence: `identity.test.ts`, `common.test.ts`.

### Task 3 - Graph and research models

**Pass.** `relationships` and `claims` carry every v3.1 field and the shared embedded contracts. The
validator enforces the endpoint matrix: `OWNS`/`CONTROLS` (ORG -> ORG|BRAND), `MANUFACTURES` (ORG ->
PRODUCT), `DISTRIBUTES` (ORG -> PRODUCT|BRAND, market), and `IMPORTS_TO_MARKET` (ORG -> PRODUCT,
market). `ClaimStructuredValue` is a three-way discriminated union; mismatched claim type and
structured value are rejected. Both registry versions start at 1. `canonicalKey` is present but has
no unique index. Evidence: `graph-research.test.ts`.

### Task 4 - Provenance models

**Pass.** Source has no reliability score and no `latestSnapshotId`. SourceSnapshot pins the
original-byte SHA-256, capture method, acquisition tier, and optional redaction lineage; it has no
mutable version. Asset stores object-storage metadata only (no bytes, base64, or content field).
`captureMetadata` is limited to 20 allowlisted keys, depth 2, scalar leaves, and rejects arrays and
unknown keys. Evidence: `provenance.test.ts`.

### Task 5 - Governance models

**Pass.** Corrections carry an optional target (required except for `ADD_MISSING`), typed evidence
references, review state, and an application ledger with `idempotencyKey`. Users carry exactly the
six v3.1 roles plus a separate trust level. Audit events are immutable, append-only in shape, and
reject nested or forbidden before/after summaries. Evidence: `governance.test.ts`.

### Task 6 - Shared embedded contracts

**Pass.** Spec Section 10 contracts are implemented once in `models/shared.ts` and reused:
`EvidenceLink`, `ReviewWorkflow`, `EvidenceAssessment`, `PublicationState`, `PublicationGate`,
`ResponseSolicitation`, `OrganizationResponse`, `ResearchNote`, `RevisionPreview`, and
`PublicCorrectionNotice`. Caps are attached to fields as validators, not documentation.
`PublicationState` has no `visibilityScope`; `ResearchNote` is restricted to `INTERNAL_RESEARCH`,
`LEGAL_REVIEW`, and `ADMIN_ONLY`. Evidence: `common.test.ts`, `graph-research.test.ts`,
`governance.test.ts`.

### Task 7 - Validators and caps

**Pass.** Every Section 4.5 cap is enforced at the document boundary. `CapExceededError` returns
status 422 with `CAP_EXCEEDED`; duplicate embedded values return `DUPLICATE_VALUE`; nothing is
sliced or silently discarded. Closed enums reject unknown keys. `assertUpdatePatch` rejects `_id`,
`version`, `createdAt`, `createdBy`, and the other immutable paths. Evidence: `identity.test.ts`,
`graph-research.test.ts`, `provenance.test.ts`, `governance.test.ts`, `invariants.test.ts` (I14).

### Task 8 - Lesan relation boundary

**Pass.** Exactly two relations are declared:

| Relation                          | Type             | Reverse preview                                               |
| --------------------------------- | ---------------- | ------------------------------------------------------------- |
| `Product.brand` -> Brand          | single, optional | `Brand.productsPreview`, limit 20, `updatedAt` desc           |
| `SourceSnapshot.source` -> Source | single, required | `Source.recentSnapshotsPreview`, limit 10, `retrievedAt` desc |

No other relation exists. Brand snapshots exclude aliases and mutable metadata. The required source
relation cannot be omitted. A removed single relation is stored as `{}` and treated as absent.
Reverse arrays return at most the declared window. No `hardCascade` is configured. Evidence:
`relations.integration.test.ts`, `model-inventory.log`.

### Task 9 - Starting indexes

**Pass.** 32 indexes are declared across nine collections and paired with named queries. Every named
query uses its intended index (`IXSCAN`) under `explain("executionStats")`. The only unique index is
the sparse `corrections_application_idempotency`; the `product_public_profiles` unique `productId`
index belongs to plan 09 and does not exist yet. No unique index exists on identifiers, aliases,
`matchKey`, `canonicalUrl`, or `canonicalKey`. Evidence: `index-explain.log`, `test-mongo.log`.

Representative BSON sizes: Relationship 497 bytes, Claim 467 bytes, both far below 1 MiB.

### Task 10 - Verification and report

**Pass.** All verification commands succeed; this report records the evidence.

## 3. Decisions

1. **Canonical collection names are the Lesan schema names.** `products`, `brands`, `organizations`,
   `relationships`, `claims`, `sources`, `source_snapshots`, `assets`, `corrections`, `users`, and
   `audit_events` are used directly with no mapping layer.
2. **One unique index now.** Plan 03 creates only `corrections_application_idempotency` (sparse
   unique). The second allowed unique index, `product_public_profiles.productId`, is created by plan
   09 with its read model.
3. **Indexes are declarations, not automatic side effects.** `createIndexes(db)` is an explicit
   setup call; each definition is paired with `INDEX_QUERIES` and verified by `explain()`.
4. **`captureMetadata` remains exactly 20 allowlisted keys.** The key-count cap is checked before
   the allowlist so over-limit input fails with `CAP_EXCEEDED` without broadening the allowlist.
5. **No ADR is required by this plan.** No additional collection, relation, unique index, or
   open-decision answer was introduced.

## 4. Measurements

| Measurement                      | Result                                            |
| -------------------------------- | ------------------------------------------------- |
| Declared indexes                 | 32 across 9 collections                           |
| Named queries with `IXSCAN`      | 32 / 32                                           |
| Unique non-`_id` indexes         | 1 (`corrections_application_idempotency`, sparse) |
| Lesan relations                  | 2                                                 |
| Representative Relationship BSON | 497 bytes                                         |
| Representative Claim BSON        | 467 bytes                                         |
| Full unit/invariant suite        | 57 passed, 0 failed, 15 ignored                   |
| Mongo integration suite          | 4 passed (10 steps), 0 failed                     |

The 15 ignored tests are the Mongo-gated integration tests when `RUN_MONGO_TESTS` is unset and
future invariants whose enforcing action lands in later plans.

## 5. Security negative tests

- Over-cap arrays and strings return `422 CAP_EXCEEDED`; boundary values pass.
- Duplicate identifiers, aliases, localized names, attributes, related entities, and evidence
  references are rejected.
- Unknown predicate, claim type, status, role, audit action, and product attribute values are
  rejected.
- Unknown `captureMetadata` keys, arrays, and depth > 2 are rejected.
- Nested audit summaries and summaries containing email, phone, auth subject, password hash,
  registered address, research notes, tokens, secrets, or object keys are rejected.
- Update patches containing `_id`, `version`, `createdAt`, or `createdBy` are rejected.
- Brand has no owner field; no score, badge, or verdict field exists; no source snapshot pointer or
  snapshot version can be written; no asset byte field exists.
- Relations cannot be used as authoritative lists: reverse previews are bounded to 20 and 10.
- No Category collection, speculative collection, or category relation exists.

Evidence: `forbidden-terms.log` (only a documenting comment in `models/source.ts` mentions
`latestSnapshotId`), test logs above.

## 6. Blocked/open items

None for plan 03. Plan 09 must create the deferred unique `product_public_profiles.productId` index
when the read model is introduced, and reconfirm the allowed-unique-index list then.

## 7. Files changed

Production:

- `models/shared.ts`
- `models/product.ts`, `brand.ts`, `organization.ts`, `relationship.ts`, `claim.ts`
- `models/source.ts`, `sourceSnapshot.ts`, `asset.ts`
- `models/correction.ts`, `user.ts`, `auditEvent.ts`
- `models/mod.ts`, `models/indexes.ts`
- `utils/domain/caps.ts`, `utils/domain/constants.ts`, `utils/domain/taxonomy.ts`,
  `utils/domain/mod.ts`

Tests and evidence:

- `tests/models/common.test.ts`, `identity.test.ts`, `graph-research.test.ts`, `provenance.test.ts`,
  `governance.test.ts`, `harness.ts`, `assertions.ts`, `relations.integration.test.ts`,
  `indexes.integration.test.ts`
- `tests/invariants/inventory.ts`, `tests/invariants/invariants.test.ts`
- `docs/reports/evidence/03-models-contracts-and-indexes/`

No generated declarations, frontend files, or archive files were changed. No cleanup is pending.

## 8. Verification

| Command               | Result                          | Evidence              |
| --------------------- | ------------------------------- | --------------------- |
| `deno task fmt:check` | Pass, 42 files checked          | `fmt-check.log`       |
| `deno task lint`      | Pass, 41 files checked          | `lint.log`            |
| `deno task check`     | Pass                            | `check.log`           |
| `deno task test`      | 57 passed, 0 failed, 15 ignored | `test.log`            |
| Mongo integration run | 4 passed (10 steps), 0 failed   | `test-mongo.log`      |
| Index plans           | 32 / 32 `IXSCAN`                | `index-explain.log`   |
| BSON sizes            | 497 / 467 bytes                 | `bson-sizes.log`      |
| Forbidden-term scan   | No production matches           | `forbidden-terms.log` |
