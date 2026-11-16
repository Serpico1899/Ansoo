# Plan 04 - Identity, Normalization, and Resolution (v3.1)

**Status:** Not started
**Depends on:** 03
**Blocks:** 05, 09
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`
**Roadmap:** `00-roadmap.md`

## Purpose

Implement the identity layer that everything else depends on: exact Persian name normalization, per-scheme
identifier normalization, the closed polymorphic reference registry, merge/redirect resolution, the
`FOUND`/`NOT_FOUND`/`AMBIGUOUS`/`DISPUTED`/`UNVERIFIED` contract, and the MVP search baseline.

## Non-Goals

- No fuzzy Persian search, typo tolerance, or external search engine.
- No automatic identity merge.
- No category inference, GS1-origin inference, or barcode-based ownership.
- No publication or profile assembly; those consume this layer.

## Pre-Flight

- [ ] Read spec Sections 4.1, 4.4, 5, 13, 15.2, 16.1.
- [ ] Confirm the models from plan 03 exist and the shared enums are closed.
- [ ] Confirm the installed Lesan/MongoDB query behavior for multikey identifier lookups.
- [ ] Record the target identifier schemes for the first category; if unknown, keep the decision blocked.

## Tasks

### 1. Persian name normalization (LOCKED algorithm)

Implement exactly the two-key algorithm in spec Section 13.1. Do not "improve" it without an ADR.

- [ ] `normalizedName`: NFKC; remove harakat `U+064B..U+0652` and `U+0670`; remove tatweel `U+0640`;
  fold `U+064A`/`U+0649` -> `U+06CC`, `U+0643` -> `U+06A9`; fold Persian/Arabic digits to ASCII; map ZWNJ
  and Unicode separators to space; collapse whitespace; trim; lowercase Latin.
- [ ] `matchKey`: apply `normalizedName`, then fold `U+0629` -> `U+0647`; `U+0623`/`U+0625`/`U+0622`/
  `U+0671` -> `U+0627`; `U+0624` -> `U+0648`; `U+0626` -> `U+06CC`; remove `U+0621`; remove all whitespace
  and punctuation.
- [ ] Mandatory vectors must pass exactly:

| Input | `normalizedName` | `matchKey` |
|---|---|---|
| `شركت پگاه ايران` | `شرکت پگاه ایران` | `شرکتپگاهایران` |
| `شرکت پگاه‌ایران` | `شرکت پگاه ایران` | `شرکتپگاهایران` |
| `پگاه  ` | `پگاه` | `پگاه` |
| `کاله ۱۲۳` | `کاله 123` | `کاله123` |
| `ميهن` | `میهن` | `میهن` |
| `دامدارانِ` | `دامداران` | `دامداران` |

- [ ] Add property tests for idempotence, whitespace invariance, digit folding, and no accidental
  cross-script merging.
- [ ] `matchKey` is for candidate retrieval only; never merge automatically on it.

**Exit:** all mandatory vectors and property tests pass; no second normalization implementation exists.

### 2. Identifier normalization

- [ ] Support the product schemes in spec Section 5.1 and organization schemes in Section 5.3.
- [ ] Store every identifier as a string; preserve leading zeros.
- [ ] GTIN: strip spaces/hyphens, digits only, validate length 8/12/13/14 and mod-10 check digit;
  `matchValue` zero-padded to 14 digits for lookup only.
- [ ] Iranian schemes: allow only scheme-valid characters; never convert between schemes.
- [ ] Never compare values from two different schemes.
- [ ] Validate identifier status transitions: `UNVERIFIED`, `VERIFIED`, `DISPUTED`, `RETIRED`.
- [ ] Do not create a unique index on identifiers.
- [ ] Reject a GS1 prefix or barcode as a source of country, nationality, ownership, or legal status.

**Exit:** I13 passes; a leading-zero GTIN round-trips; invalid check digits are rejected before query.

### 3. URL canonicalization

- [ ] Lowercase host, remove default port, remove fragment, strip `utm_*`, `gclid`, `fbclid`, normalize
  trailing slash per a written policy, IDN -> punycode, preserve HTTPS.
- [ ] Canonicalized equality is suggestive for Source dedup, never automatic.
- [ ] Store the original URL where required for provenance; store the canonical form for matching.

**Exit:** canonicalization tests cover tracking parameters, case, default ports, fragments, and IDN.

### 4. Closed entity registry and resolver

- [ ] Implement `EntityRef<T> = { type: T; id: ObjectId }` exactly; reject extra keys.
- [ ] Use the closed `EntityType` registry and per-field allowlists:
  `RelationshipEndpointType`, `ClaimAboutType`, `CorrectionTargetType`, `AuditTargetType`.
- [ ] Resolve every reference through one server-side registry. Never accept a collection name, model name,
  Mongo path, or operator from a client.
- [ ] Enforce existence, type/id match, lifecycle, and merge-following on both write and read paths.
- [ ] Follow `mergedIntoId` max depth 5 with cycle detection; a cycle returns an error and raises an admin
  flag; never loop.
- [ ] Distinguish "target missing", "target archived", "target merged", and "wrong type".

**Exit:** no action can persist or resolve an unvalidated polymorphic reference; merge chain and cycle tests
pass (S20).

### 5. Merge and redirect

- [ ] Merge creates a tombstone on the old document and sets `mergedIntoId`, `mergedAt`, `mergedBy`,
  `mergeReason`; historical references are never rewritten.
- [ ] Public reads redirect to the survivor with a notice: "this record was merged into X."
- [ ] Block merges with contradictory official identifiers; require a human decision.
- [ ] Support unmerge through AuditEvent + lifecycle restoration; keep it rare and audited.
- [ ] Enforce CAS on merge and record an AuditEvent.

**Exit:** I15 and S20 pass; after merge, historical documents still carry the old ID.

### 6. Product resolution contract

Implement `resolveProduct` with the exact result union:

```ts
type ResolutionResult =
  | { state: "FOUND"; productId: ObjectId; confidence: "EXACT" }
  | { state: "NOT_FOUND" }
  | { state: "AMBIGUOUS"; candidates: Array<{ productId: ObjectId; reason: string }> }
  | { state: "DISPUTED"; productId: ObjectId; disputeNote: string }
  | { state: "UNVERIFIED"; productId: ObjectId };
```

- [ ] Resolve by exact scheme + normalized value + applicable jurisdiction/scope.
- [ ] Return `AMBIGUOUS` with candidates when more than one exact match exists; never pick arbitrarily.
- [ ] Return `NOT_FOUND` as a valid answer, not an error.
- [ ] Do not infer a Product from a Brand, category, barcode prefix, or name similarity.
- [ ] Use `matchValue` only as a lookup key; padding never auto-merges distinct trade items.

**Exit:** S19 resolution cases pass: exact, not found, ambiguous duplicate, invalid check digit, jurisdiction
narrowing, leading zeros, disputed, unverified.

### 7. Brand mapping workflow

- [ ] `brandMapping.status` defaults to `UNREVIEWED`.
- [ ] `candidateBrandId` is a proposal; only a `VERIFIED` mapping populates `Product.brand`.
- [ ] `setBrandMapping` is a domain action with authorization, validation, audit, and relation update.
- [ ] `DISPUTED` and `REJECTED` mappings preserve the previous decision history in audit.
- [ ] A Product may temporarily have no verified brand; expose that state explicitly.

**Exit:** brand mapping states are independently queryable; a candidate never leaks as a verified brand.

### 8. Search baseline

- [ ] Exact `matchKey` lookup plus escaped prefix on `normalizedName`.
- [ ] No fuzzy matching, stemming, or typo tolerance in the MVP.
- [ ] Do not promise Persian full-text search on MongoDB.
- [ ] Query only public/live records; exclude merged tombstones from normal results and redirect when a
  tombstone is addressed directly.
- [ ] Return explicit empty/ambiguous results; never a fabricated match.

**Exit:** search tests prove prefix escaping, tombstone handling, and no cross-scheme comparison.

### 9. Actions and tests

Implement the identity actions (names may follow the scaffold):

- [ ] `product.resolveIdentifier`, `product.verifyIdentifier`, `product.setBrandMapping`.
- [ ] `search.resolveProduct`, `search.searchEntities`.
- [ ] Brand/organization/product add/get/update actions required by this plan, all with strict validators
  and audit.
- [ ] `entity.merge` / `entity.unmerge` (or the equivalent reviewed action) with CAS and audit.
- [ ] Tests: S01, S02, S20, S25, I13, I15, plus identifier negative cases.
- [ ] Record the first supported schemes and any blocked scheme decision.

## Deliverables

1. Normalization module with mandatory vectors and property tests.
2. Identifier and URL normalization with negative tests.
3. Closed registry + resolver with merge/redirect.
4. Resolution contract and brand-mapping workflow.
5. MVP search actions.
6. `reports/04-identity-normalization-and-resolution.md`.

## Acceptance Criteria

1. All six normalization vectors pass exactly (S25).
2. GTIN leading zeros round-trip; invalid check digits are rejected (I13).
3. No automatic merge from `matchKey`, aliases, or identifiers.
4. Merge chain follows max 5, detects cycles, and never rewrites history (I15, S20).
5. Resolution never returns an arbitrary match; `NOT_FOUND` is a first-class result.
6. No GS1/barcode inference exists in code or projections.
7. Identity actions are authorized, audited, and cap-safe.

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
| Normalization drifts from spec | Copy the algorithm and vectors; do not "fix" them without an ADR |
| Duplicate identifiers create silent wrong matches | Return `AMBIGUOUS`; never choose a candidate |
| Merge cycle or deep chain | Max depth 5 + cycle detection + admin flag |
| Client supplies a collection/model name | Closed registry; reject extra keys and unknown types |
| Search promises more than MongoDB supplies | Document exact/prefix only; measure before adding a search engine |

## Out of Scope

- Publication, evidence assessment, and public profile assembly.
- Data acquisition and catalog seeding.
- Unique identifier indexes or fuzzy search.
