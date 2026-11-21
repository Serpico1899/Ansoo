# Plan 09 - Public Profile, Read Model, and Vertical Slice

**Status:** Complete (2026-11-19) **Plan:** `../plans/09-public-profile-read-model-and-vertical-slice.md`
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`

## 1. Environment

| Item     | Value                                                                       |
| -------- | --------------------------------------------------------------------------- |
| OS       | Linux 7.0.0-43-generic x86_64                                               |
| CPU      | Intel Core i7-6700HQ @ 2.60 GHz, 4 cores / 8 threads, 7.7 GiB RAM           |
| Deno     | 2.4.5 (V8 13.7, TypeScript 5.8.3)                                           |
| Lesan    | `jsr:@hemedani/lesan@^0.2.3`                                                |
| MongoDB  | 8.0.13, single-node replica set `rs0` on port 27019                         |
| Database | Test harness per suite (`ansoo_plan09_*`)                                   |
| Frontend | Next.js 16 / TypeScript, `pnpm typecheck` and `pnpm lint`                   |

Environment and command evidence: `evidence/09-public-profile-read-model-and-vertical-slice/`.

## 2. Results by Task

| Task                                  | Result | Evidence                                                                        |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| 1. Profile assembly contract          | Pass   | `utils/publicProfile/types.ts`, `tests/publicProfile/contract.test.ts`          |
| 2. Inheritance and scope rules        | Pass   | `utils/publicProfile/assemble.ts`, `tests/publicProfile/profile.integration.test.ts` |
| 3. Public profile read action         | Pass   | `src/product/getPublicProfile/`, dispatch + profile integration tests           |
| 4. Read model `product_public_profiles` | Pass | `utils/publicProfile/readModel.ts`, rebuild/repair script and tests            |
| 5. Retraction and invalidation SLO    | Pass   | `utils/research/{status,invalidation}.ts`, S24 tests                            |
| 6. Unknowns, conflicts, limitations   | Pass   | profile integration unknowns/conflict steps, I12 contract tests                 |
| 7. Vertical slice S19                 | Pass   | S19 scan/read-model benchmark and seeded dataset                                |
| 8. Tests and report                   | Pass   | full suite below                                                                |

### Contract and Assembled Profile

The typed output follows spec Section 14.2: resolution, product identity, brand, findings, unknowns,
`noUniversalScore: true`, and `builtAt`. Each finding carries kind, scope, optional `inheritedFrom`,
predicate or claim type, public wording, counterparties, validity, assessment outcome, limitations,
publication/review dates, evidence, organization responses, right-of-reply state, and a correction
notice when present. Evidence exposes only public source metadata and an optional public URL; research
notes, reviewer IDs, decision actors, snapshot IDs, raw asset keys, and source snapshot internals are
not returned. Contract tests reject score/verdict/badge fields and universal-verdict prose.

`builtAt` is the **canonical-state watermark** (the newest canonical timestamp used to build the
payload), not a wall-clock rebuild time. This makes S30 byte identity possible without weakening the
profile content. The technical read-model record separately stores its own build time.

### Inheritance and Scope

- Product findings use `scope: "PRODUCT"`.
- Brand findings appear on every product of that brand with `scope: "BRAND"` and a visible
  `inheritedFrom` label.
- Organization findings require a **published** Brand -> Organization edge and use
  `scope: "ORGANIZATION"` with an `inheritedFrom` label.
- Traversal stops after Product -> Brand -> Organization. Organization-to-Organization edges are
  excluded, even when both ends are otherwise reachable.
- Findings are deduplicated by kind + finding id; when multiple paths reach one finding, the nearest
  scope wins.
- A finding without publicly accessible evidence remains visible only with an explicit
  `MISSING_EVIDENCE` unknown; restricted-source evidence is withheld and flagged with
  `EVIDENCE_WITHHELD`. Conflicting evidence keeps separate stances and the `DISPUTED` assessment
  outcome; no aggregate verdict is produced.

### Resolution and Action

`products.getPublicProfile` accepts exactly one of `set.id`, `set.gtin`, or `set.scheme + set.value`,
with optional `jurisdiction`/`issuer` only when a scheme is supplied. `NOT_FOUND`, `AMBIGUOUS`,
`DISPUTED`, and `UNVERIFIED` are returned as first-class states. `NOT_FOUND` includes contribution
guidance; `AMBIGUOUS` returns candidates without choosing; merged ids redirect to the survivor with a
`MERGED_IDENTITY_REDIRECT` unknown. Invalid identifiers are `422` and do not echo values.

The action reads the read model, detects stale `sourceVersions`, honors pending rebuild requests, and
rebuilds on demand if needed. If the read model fails, it falls back to an on-demand assembly rather
than turning into `NOT_FOUND`.

### Read Model, Rebuild, and Repair

`product_public_profiles` is keyed by `productId`, stores `schemaVersion`, `payload`, `sourceVersions`,
`sourceHash`, and build metadata. A unique `productId` index and a finding lookup index are created at
startup and by `ensureReadModelIndexes`. `public_profile_rebuild_queue` records pending rebuilds with a
reason, attempts, and last error.

Rebuild triggers cover publication changes, evidence changes, product merges/unmerges, brand-relation
changes, corrections, and retractions. Rebuild requests are queued rather than assumed atomic.
`deno task read-model:rebuild` rebuilds all products; `deno task read-model:repair` drains the queue.
`rebuildAllProfiles` reports scanned/rebuilt/failed counts and queue depth.

### Retraction and Invalidation

`retractFinding` updates the canonical finding first, deletes affected read-model records, then purges
registered public surfaces (cache/CDN and search index). The path is idempotent and audited with
`FINDING_RETRACTED`. Surface failures leave a visible `PENDING` repair record in
`public_profile_surface_repairs` and reject the operation. A retracted finding does not reappear after
a rebuild. A published correction persists its public notice and updates profile content on rebuild.

### Unknowns and Limitations

Explicit unknown codes cover missing brand, unverified identifiers, no published findings, missing
evidence, unresolved disputes, absent validity dates, merged identity redirect, and contribution
guidance. Assessment limitations are kept per finding, separate from the assessment outcome. Unknown
is never converted to false, and unsupported is never converted to a negative boolean.

## 3. Decisions

1. **Inheritance is a bounded read-time projection, not denormalized data.** Product, Brand, and
   Organization records remain canonical; scope is computed on every assembly.
2. **`builtAt` is a canonical watermark.** It is derived from the newest canonical timestamp used, so a
   full rebuild from unchanged canonical state is byte-identical. The technical record carries the
   actual build time separately.
3. **Rebuild triggers use a queue.** Publication/evidence/merge/brand/correction changes enqueue a
   product rebuild rather than relying on multi-document atomicity. `public_profile_rebuild_queue` and
   `public_profile_surface_repairs` are technical infrastructure collections, not additional domain
   collections; they are not client-readable and never hold canonical facts.
4. **Retraction is synchronous and audited.** Canonical change, read-model delete, and surface purge
   happen in that order; surface failure is visible and repairable.
5. **Cache/CDN and search surfaces are interfaces.** The default in-memory surfaces prove the
   invalidation contract; production adapters remain deployment work.
6. **The frontend handoff is type-level.** The generated declaration and the spike server action
   consume the new profile shape and pass `pnpm typecheck`/`pnpm lint`; no production UI was added.

## 4. Measurements

S19 warm profile read (60 samples, read-model hit, seeded profile):

| Metric        | Value                                                              |
| ------------- | ------------------------------------------------------------------ |
| p50           | 10.38 ms                                                            |
| p95           | 15.29 ms                                                           |
| Payload       | 5,112 bytes                                                        |
| Query type    | `products.getPublicProfile` by product id, read-model hit          |
| Documents     | 1 product, 4 claims, 3 relationships, 1 source, 1 snapshot         |
| Platform      | linux x86_64, Deno 2.4.5, MongoDB 8.0.13, Lesan 0.2.3              |

S19 scan: leading-zero GTIN `0006381333935` resolved `FOUND` with 4 findings and 5 explicit unknowns.

S24 retraction: end-to-end 1,287.63 ms from canonical retraction through read-model delete and
cache/CDN/search surface purge; measured surfaces reported 0 ms. Target is p95 < 60 s.

S30 rebuild: two rebuilds of the same canonical state produced identical 5,112-byte payloads,
SHA-256 `a6ffc97b3e9f98c7d61daf76dd957274eec60f2f102e2de813ac92ab262b368e`, with 10
`sourceVersions` keys.

Full backend suite: 151 tests passed, 183 steps, 0 failed, 9 intentionally ignored duplicate
invariant tests, in 1m56s.

## 5. Security and Negative Tests

| Attempt                                              | Result                                                    |
| ---------------------------------------------------- | --------------------------------------------------------- |
| Brand finding inherited onto a product               | Visible with `scope: BRAND` and `inheritedFrom`           |
| Organization finding without a published Brand edge  | Excluded                                                  |
| Organization-to-organization multi-hop conclusion    | Excluded                                                  |
| Duplicate finding via multiple paths                 | Returned once, nearest scope                              |
| Restricted source evidence                           | Withheld; `EVIDENCE_WITHHELD` unknown                      |
| Finding with no public evidence                      | Visible but flagged `MISSING_EVIDENCE`                    |
| Conflicting evidence                                 | Separate stances + `DISPUTED`; no aggregate verdict       |
| Absent brand                                         | Explicit `MISSING_BRAND`; no fabricated brand              |
| Ambiguous GTIN                                       | `AMBIGUOUS` with candidates, no chosen product            |
| Disputed identifier                                  | `DISPUTED`, no silent resolution                           |
| Unverified identifier                                | `UNVERIFIED`, provisional identity                         |
| Not-found GTIN                                       | `NOT_FOUND` with contribution guidance                    |
| Merged product id                                    | Survivor profile + redirect unknown                       |
| Client deep projection / unknown keys                | Rejected or ignored; public allowlist only                |
| Internal research notes, reviewer IDs, snapshot IDs  | Absent from profile and contract tests                    |
| Score/verdict/badge field or universal-verdict prose | Rejected by contract tests                                |
| Retraction with failed surface purge                 | Rejected; `PENDING` repair record visible                 |
| Rebuild after retraction                             | Retracted finding absent                                  |

## 6. Blocked / Open Items

- **Production cache/CDN and search adapters:** the invalidation contract and repair record exist;
  real adapters and credentials are deployment work. Owner: backend/platform. Consequence: S24 uses
  in-memory surfaces today.
- **Representative real dataset:** S19 uses the deterministic synthetic seed. The real corpus,
  researcher minutes, and Go/No-Go remain plan 10. Consequence: latency is proven on the seeded shape,
  not on production volume.
- **Frontend render check:** only the generated contract and a typed server action compile. No UI was
  in scope; a visual render check belongs to frontend delivery.
- **Read-model observability:** queue-depth/repair-count logs are exposed by command summaries; a
  production metrics sink is not wired.
- **Multi-instance invalidation:** a shared pub/sub or job queue is required before horizontal
  production scaling; the current surface registry is in-process.

## 7. Files Changed

Production:

- `utils/publicProfile/{types,assemble,readModel,surfaces,mod}.ts`
- `utils/research/{status,invalidation}.ts`
- `utils/provenance/evidence.ts`, `utils/identity/merge.ts`
- `utils/governance/correction.ts`, `models/correction.ts`
- `utils/projections/classification.ts`, `utils/api/types.ts`, `utils/mod.ts`
- `src/product/getPublicProfile/{getPublicProfile.fn,getPublicProfile.val,mod}.ts`
- `scripts/rebuild-public-profiles.ts`, `mod.ts`, `deno.json`
- `declarations/selectInp.ts`, `front/src/types/declarations/selectInp.ts`
- `front/src/app/actions/spike/getPublicProfile.ts`

Tests and docs:

- `tests/publicProfile/{profile.integration,contract}.test.ts`
- `tests/api/dispatch.integration.test.ts`, `tests/governance/corrections.integration.test.ts`
- This report and `evidence/09-public-profile-read-model-and-vertical-slice/`
- Plan status, summary, documentation index, roadmap, and reports index

Cleanup: no production feature was implemented outside Plan 09. No scratch script, secret, token, or
restricted content was committed.

## 8. Verification

Run from `back/` unless noted:

| Command                            | Result                                     | Evidence                  |
| ---------------------------------- | ------------------------------------------ | ------------------------- |
| `deno task fmt:check`              | 151 files checked                          | `fmt.log`                 |
| `deno task lint`                   | 150 files checked, no issues               | `lint.log`                |
| `deno task check`                  | Entry points and rebuild script checked    | `check.log`               |
| `deno task types`                  | Generated and copied declarations          | `types.log`               |
| `RUN_MONGO_TESTS=1 deno task test` | 151 passed, 183 steps, 0 failed, 9 ignored | `tests.log`, `scenarios.log` |
| `cd ../front && pnpm typecheck`    | Pass, no output                            | `front-typecheck.log`     |
| `cd ../front && pnpm lint`         | Pass, no output                            | `front-lint.log`          |

The 9 ignored tests are duplicate invariant entries covered by their named suites; they are
intentionally skipped to avoid double-running the same checks.
