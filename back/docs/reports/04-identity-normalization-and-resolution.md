# Plan 04 - Identity, Normalization, and Resolution (v3.1) - Report

**Status:** Complete (2026-11-17) **Plan:** `docs/plans/04-identity-normalization-and-resolution.md`
**Canonical contract:** `../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` (CT-DOMAIN-SPEC v3.1)
**Evidence:** `docs/reports/evidence/04-identity-normalization-and-resolution/`

## 1. Environment

| Item              | Value                                                         |
| ----------------- | ------------------------------------------------------------- |
| OS                | Ubuntu 24.04.2 LTS (x86_64)                                   |
| Runtime           | Deno 2.4.5                                                    |
| Backend framework | Lesan 0.2.3 (`jsr:@hemedani/lesan@0.2.3`, `deno.lock`)         |
| Database          | MongoDB 8.0.13, single-node replica set `rs0` on port 27019   |
| Test databases    | `ansoo_plan04_*` (created and dropped by each integration run) |

Commands used:

```bash
deno task db:dev
deno task fmt
deno task fmt:check
deno task lint
deno task check
RUN_MONGO_TESTS=1 deno test --allow-all tests/identity/
RUN_MONGO_TESTS=1 deno task test
```

## 2. Results by task

### Task 1 - Persian name normalization

**Pass.** `utils/identity/normalize.ts` implements exactly the two-key Section 13.1 algorithm.
`normalizedName` and `matchKey` produce all six mandatory vectors exactly:
`شركت پگاه ايران` -> `شرکت پگاه ایران` / `شرکتپگاهایران`, `شرکت پگاه‌ایران` -> `شرکت پگاه ایران` /
`شرکتپگاهایران`, `پگاه  ` -> `پگاه` / `پگاه`, `کاله ۱۲۳` -> `کاله 123` / `کاله123`, `ميهن` -> `میهن` /
`میهن`, `دامدارانِ` -> `دامداران` / `دامداران`. Property tests cover idempotence, whitespace
invariance, digit folding, and no accidental cross-script merging. `matchKey` is retrieval-only and never
merges anything. Evidence: `normalize.test.ts`.

### Task 2 - Identifier normalization

**Pass.** `utils/identity/identifier.ts` normalizes GTIN values as strings, preserves leading zeros,
strips spaces/hyphens, validates lengths 8/12/13/14 and the mod-10 check digit, and stores a zero-padded
14-digit `matchValue` for lookup only. Status transitions are limited to the declared state machine,
with `RETIRED` terminal. `gs1PrefixMetadata` returns `inference: "FORBIDDEN"`; no GS1-origin,
nationality, ownership, or legal-status inference exists. Organization schemes and all non-GTIN product
schemes fail closed with `UNSUPPORTED_SCHEME` until authoritative character/checksum rules are supplied.
Evidence: `identifier.test.ts`, `verifyIdentifier.integration.test.ts`.

### Task 3 - URL canonicalization

**Pass.** `utils/identity/url.ts` lowercases the host, removes default ports, fragments, and
`utm_*`/`gclid`/`fbclid` parameters, converts IDN hosts to punycode, preserves HTTPS, and removes one
trailing slash except at the root. Non-HTTP(S), malformed, and credential-bearing URLs are rejected.
Canonical equality is treated as suggestive only. Evidence: `url.test.ts`.

### Task 4 - Closed entity registry and resolver

**Pass.** `utils/identity/registry.ts` accepts exactly `{type, id}`, rejects extra keys, unknown types,
wrong type/id combinations, and non-24-hex ids. The server owns the type-to-collection mapping and the
per-field allowlists. Resolution follows `mergedIntoId` for at most five hops, detects cycles, raises an
admin flag for cycles/depth, and distinguishes `NOT_FOUND`, `ARCHIVED`, `MERGE_CHAIN_BROKEN`, and
wrong-type errors. Evidence: `registry.integration.test.ts`.

### Task 5 - Merge and redirect

**Pass.** `utils/identity/merge.ts` writes a tombstone (`lifecycle: MERGED`, `mergedIntoId`, `mergedAt`,
`mergedBy`, `mergeReason`) with CAS, never rewrites referencing documents, and appends
`ENTITY_MERGED`. Contradictory verified identifiers for the same scheme block the merge.
`unmergeEntity` restores `ACTIVE`, removes merge fields, bumps `version`, and appends
`ENTITY_UNMERGED`. Merge requires `MODERATOR`/`ADMIN`; a contributor receives `FORBIDDEN`. S20 chain
and cycle behavior is covered by the registry tests; I15 by the merge test. Evidence:
`merge.integration.test.ts`, `registry.integration.test.ts`.

### Task 6 - Product resolution contract

**Pass.** `utils/identity/resolution.ts` returns exactly `FOUND` (`confidence: EXACT`), `NOT_FOUND`,
`AMBIGUOUS` with candidates, `DISPUTED` with a note, or `UNVERIFIED`. Resolution uses scheme +
normalized value + optional jurisdiction/issuer, follows merge tombstones to the survivor, ignores
retired identifiers, deduplicates by survivor, and never selects arbitrarily. Leading-zero and padded
GTIN lookups resolve through `matchValue`; an invalid check digit fails before query. Evidence:
`resolution.integration.test.ts`.

### Task 7 - Brand mapping workflow

**Pass.** `utils/identity/brandMapping.ts` defaults new products to `UNREVIEWED`. `candidateBrandId`
remains a proposal. Only `VERIFIED` writes `Product.brand` through the Lesan relation API and refreshes
the bounded reverse preview; `DISPUTED`/`REJECTED` remove the verified relation. Every review is
version-checked and appends `BRAND_MAPPING_REVIEWED` with before/after status. A candidate never leaks as
a verified brand. Evidence: `brandMapping.integration.test.ts`.

### Task 8 - Search baseline

**Pass.** `utils/identity/search.ts` uses exact `matchKey` plus an escaped prefix on `normalizedName`.
Regex metacharacters are escaped; there is no fuzzy matching, stemming, or typo tolerance. Normal results
include only `lifecycle: ACTIVE` records and exclude merged tombstones. Addressing a tombstone directly
through `findEntityByRef` returns the survivor plus the notice `this record was merged into <id>`.
Search is type-scoped and returns an explicit `{ state: "EMPTY", results: [] }`. Evidence:
`search.integration.test.ts`.

### Task 9 - Identity actions and tests

**Pass.** Authorized, audited, cap-safe domain services exist for identity create/rename
(`entities.ts`), identifier add/status change (`verifyIdentifier.ts`), product resolution
(`resolution.ts`), brand mapping (`brandMapping.ts`), search (`search.ts`), and merge/unmerge
(`merge.ts`). S01/S02, S20, S25, I13, and I15 are green, along with identifier, URL, registry, resolution,
mapping, and search negative cases. Evidence: `test-identity.log`, `test-mongo.log`.

HTTP/Lesan action triads are deliberately not registered in this plan: plan 08 owns the single
server-derived actor/capability check and the action triad/projection contract. The plan-04 services take
a server-controlled actor object and are ready to be wrapped by those actions.

## 3. Decisions

1. **Only GTIN is a supported identifier scheme for now.** Every other product and organization scheme
   fails closed with `UNSUPPORTED_SCHEME` until authoritative character and checksum rules are supplied.
   This avoids guessing scheme rules (spec 13.2).
2. **Trailing-slash policy:** remove one trailing slash except at the root path. This is the written
   policy required by spec 13.3; URL equality remains suggestive for Source dedup.
3. **Contradictory official identifiers block a merge.** Two records with non-overlapping `VERIFIED`
   values for the same scheme require a human decision rather than an automatic merge.
4. **Provisional authorization:** identity/identifier/brand-mapping mutations require an active
   `RESEARCHER`, `RESEARCH_REVIEWER`, `MODERATOR`, or `ADMIN`; merge/unmerge requires `MODERATOR` or
   `ADMIN`. Plan 08 owns the final centralized role/capability matrix.
5. **Domain services now, HTTP triads in plan 08.** This keeps actor injection and projections in one
   reviewed place instead of duplicating authorization in premature actions.
6. **No ADR is required by this plan.** No collection, field, predicate, relation, or open-decision answer
   was introduced.

## 4. Measurements

| Measurement                         | Result                               |
| ----------------------------------- | ------------------------------------ |
| Mandatory normalization vectors     | 6 / 6 exact                          |
| Identity tests                      | 27 passed (46 steps), 0 failed       |
| Full unit/invariant/integration run | 89 passed (56 steps), 0 failed, 10 ignored |
| Declared unique identifier indexes  | 0                                    |
| Merge-follow maximum                | 5 hops + cycle detection             |
| Default brand mapping state         | `UNREVIEWED`                         |

The 10 ignored tests on the default `deno task test` run are Mongo-gated integrations; they all pass when
`RUN_MONGO_TESTS=1` is set.

## 5. Security negative tests

- Non-GTIN schemes and invalid GTIN check digits are rejected before any write/query.
- Extra keys, unknown types, wrong type/id pairs, malformed ids, archived targets, missing targets,
  merge cycles, and over-depth chains are rejected by the registry.
- Merge self-reference, stale versions, contributor merges, and contradictory identifiers are rejected.
- Brand-mapping contributor writes, stale versions, missing candidates, and missing/archived brands fail
  closed; non-verified mappings do not populate `Product.brand`.
- Search escapes regex metacharacters and excludes merged tombstones from normal results.
- No GS1/barcode origin or ownership inference exists; the only prefix helper returns
  `inference: "FORBIDDEN"`.
- Cap violations use the plan-03 hard-cap errors (`422`), never silent truncation.

Evidence: `test-identity.log`, `forbidden-inference-scan.log`.

## 6. Blocked/open items

None for plan 04. Plan 08 must register the HTTP action triads and inject the authenticated actor; plan 09
consumes resolution for the public profile read model. Broader scheme support stays blocked until
authoritative rules arrive.

## 7. Files changed

Production:

- `utils/identity/normalize.ts`, `identifier.ts`, `url.ts`, `registry.ts`, `merge.ts`,
  `resolution.ts`, `brandMapping.ts`, `search.ts`, `verifyIdentifier.ts`, `entities.ts`, `mod.ts`
- `utils/mod.ts` (identity services exposed as the `identity` namespace to avoid duplicate type exports)

Tests and evidence:

- `tests/identity/normalize.test.ts`, `identifier.test.ts`, `url.test.ts`,
  `registry.integration.test.ts`, `merge.integration.test.ts`, `resolution.integration.test.ts`,
  `brandMapping.integration.test.ts`, `search.integration.test.ts`,
  `verifyIdentifier.integration.test.ts`, `entities.integration.test.ts`
- `docs/reports/evidence/04-identity-normalization-and-resolution/`

No models, generated declarations, frontend files, or archive files were changed. No cleanup is pending.

## 8. Verification

| Command                       | Result                                     | Evidence                |
| ----------------------------- | ------------------------------------------ | ----------------------- |
| `deno task fmt:check`         | Pass, 63 files checked                     | `fmt-check.log`         |
| `deno task lint`              | Pass, 62 files checked                     | `lint.log`              |
| `deno task check`             | Pass                                       | `check.log`             |
| `deno task test` (Mongo)      | 89 passed (56 steps), 0 failed, 10 ignored | `test-mongo.log`        |
| Identity test run (Mongo)     | 27 passed (46 steps), 0 failed             | `test-identity.log`     |
| Forbidden-inference scan      | Only the documenting `FORBIDDEN` helper    | `forbidden-inference-scan.log` |
