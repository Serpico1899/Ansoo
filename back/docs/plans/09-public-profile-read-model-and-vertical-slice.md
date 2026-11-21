# Plan 09 - Public Profile, Read Model, and Vertical Slice (v3.1)

**Status:** Complete (2026-11-19)
**Depends on:** 04, 05, 06, 07, 08
**Feeds:** 11 (S19/S24/S30), frontend
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`
**Roadmap:** `00-roadmap.md`

## Purpose

Deliver the product's heart: scan/enter an identifier, resolve it honestly, and assemble a public product
profile with separated identity, findings, evidence, responses, limitations, and unknowns. Add the
rebuildable `product_public_profiles` read model and the synchronous retraction path.

## Non-Goals

- No universal score, badge, ranking, or single verdict.
- No transitive multi-hop ownership conclusions (I11).
- No legal/campaign modules.
- No production UI; only the backend contract and a minimal frontend consumption check.

## Pre-Flight

- [x] Read spec Sections 12, 14, 20.1 (S19, S24, S30), 24.
- [x] Confirm resolution (plan 04), publication (plan 05), evidence (plan 06), corrections (plan 07), and
  projections/auth (plan 08).
- [x] Confirm the public projection builder cannot be widened by a client.
- [x] Confirm a seeded dataset exists for S19; the deterministic synthetic dataset is used here and
  the real corpus remains plan 10.

## Tasks

### 1. Profile assembly contract

Implement the typed output in spec Section 14.2:

- [x] `PublicProductProfile`: resolution, product identity, brand, findings, unknowns,
  `noUniversalScore: true`, `builtAt`.
- [x] Product view: id, name, packaging, identifiers approved for display, brand-mapping status,
  categoryCode.
- [x] Brand view: id, name (or explicit absent state).
- [x] `PublicFindingView`: finding id/kind, scope, inheritedFrom?, predicate?/claimType?, public wording,
  counterparties, validity, assessment outcome, limitations, publishedAt, lastReviewedAt, evidence,
  organization responses, right-of-reply state, correction notice.
- [x] `PublicEvidenceView`: source title, publisher, capture/publication dates, excerpt, locator, stance,
  public source URL, isRedacted.
- [x] `PublicResponseView`: organization name, response text, submittedAt, representative verified.
- [x] `PublicCorrectionNotice`: correctedAt, reason, previous wording, auditEventId.
- [x] Unknowns are explicit codes/messages; never omit a gap silently.
- [x] No `score`, `verdict`, `badge`, or legal/ethical conclusion field exists in the type.

**Exit:** the type is fully specified and every field is classified for public display.

### 2. Inheritance and scope rules

- [x] Product-level finding displayed directly with `scope: "PRODUCT"`.
- [x] Brand-level findings displayed on all Products of that Brand with `scope: "BRAND"` and
  `inheritedFrom`; the scope label is visible in the payload.
- [x] Organization-level findings included only through a **published** edge in Product -> Brand -> Org.
- [x] Maximum depth 2 hops; no automatic traversal for ultimate ownership (I11).
- [x] A finding missing its evidence/source access is withheld or flagged, not silently published.
- [x] No finding is duplicated when multiple paths reach it; deduplicate by finding id with explicit scope.

**Exit:** I11 and inheritance tests pass; no multi-hop conclusion appears.

### 3. Public profile read action

- [x] `getPublicProductProfile` accepts an identifier or product id and returns a `ResolutionResult` plus
  profile.
- [x] Resolution states are preserved: `FOUND`, `NOT_FOUND`, `AMBIGUOUS`, `DISPUTED`, `UNVERIFIED`.
- [x] `NOT_FOUND` returns a useful empty profile with contribution guidance, not an error.
- [x] `AMBIGUOUS` returns candidates; never chooses one.
- [x] Public profile excludes research notes, reviewer IDs, role/PII data, restricted sources, private asset
  keys, and security metadata.
- [x] Retracted findings are absent or explicitly marked; never returned as published.
- [x] Merged identities redirect with a notice.
- [x] Response time target: p95 < 400 ms server-side on representative data.

**Exit:** S19 passes with correct answer, separated statuses, evidence, and p95 < 400 ms.

### 4. Read model `product_public_profiles`

- [x] Derived collection keyed by `productId`; payload is the Section 14.2 output plus `sourceVersions`.
- [x] The read model is technical, not a domain source of truth; no client writes.
- [x] Rebuild on publication change, evidence change, merge, brand-relation change, and retraction.
- [x] Use an outbox/repair path for rebuild triggers; never assume a multi-document write is atomic.
- [x] Record `sourceVersions` so stale payloads are detectable.
- [x] Add a full rebuild command that reads only canonical collections.
- [x] Rebuild output must be byte-identical for the same canonical state (S30).
- [x] Add a repair job for missed/failed rebuilds; log queue depth and repair count.
- [x] Unique index on `productId`.

**Exit:** S30 passes; a stale or missing read model is detectable and repairable.

### 5. Retraction and invalidation SLO

- [x] Implement the synchronous retraction path: canonical document -> read model -> cache/CDN -> search
  index.
- [x] The path must be idempotent and audited; failure leaves a visible error and a repair record.
- [x] Target p95 < 60 seconds until the finding is invisible on all public surfaces (S24).
- [x] Add a test harness that measures each surface and the end-to-end SLO.
- [x] A retracted finding must not reappear after a rebuild.
- [x] A published correction updates the public correction notice and the profile content.

**Exit:** S24 passes; retraction cannot be undone by a stale cache or rebuild.

### 6. Unknowns, conflicts, and limitations

- [x] Emit explicit unknowns for missing brand, unverified identifiers, no published findings, missing
  evidence, unresolved disputes, and absent dates.
- [x] Show limitations separately from assessment outcome.
- [x] Represent conflicting evidence without collapsing to a verdict.
- [x] Never convert unknown to false, or unsupported to a negative boolean (I02).
- [x] Add a public-wording check: no prose that implies a universal verdict.

**Exit:** I02 and I12 pass in the assembled profile.

### 7. Vertical slice S19

- [x] Seed or load a representative dataset: Products with GTINs, Brands, Organizations, published
  Relationships, Claims, Sources, Snapshots, Assets, responses, and unknowns.
- [x] Exercise: scan GTIN -> normalize -> resolve -> profile with evidence, dates, statuses, and limitations.
- [x] Verify a leading-zero GTIN, an ambiguous duplicate, a not-found code, and a disputed record.
- [x] Verify a Brand-level finding is inherited with a visible scope label.
- [x] Verify an Organization-level finding appears only through a published edge and max 2 hops.
- [x] Verify no internal field appears for guest/public.
- [x] Measure p95 server-side and record hardware, MongoDB version, Lesan version, document count, payload
  size, and query type.
- [x] Hand the generated contract to the frontend for a minimal render check; no production UI.

**Exit:** Stage F vertical-slice criterion is met with evidence.

### 8. Tests and report

- [x] Tests: S19, S24, S30, I02, I04, I11, I12; inheritance, unknown, retraction, rebuild, and read-model
  repair.
- [x] Negative tests: deep client projection, restricted source, retracted finding, merged identity,
  ambiguous identifier, absent brand.
- [x] Write `reports/09-public-profile-read-model-and-vertical-slice.md`.

## Deliverables

1. Public profile assembly contract and action.
2. Inheritance/scope rules with explicit unknowns.
3. `product_public_profiles` read model with rebuild and repair.
4. Synchronous retraction path with SLO measurement.
5. S19/S24/S30 evidence.
6. `reports/09-public-profile-read-model-and-vertical-slice.md`.

## Acceptance Criteria

1. A scan of a known GTIN returns a profile with separated identity, findings, evidence, responses,
   limitations, and unknowns.
2. `NOT_FOUND`, `AMBIGUOUS`, `DISPUTED`, and `UNVERIFIED` are honest, first-class outcomes.
3. Brand inheritance is labeled and Organization findings require a published edge (max 2 hops).
4. No score/verdict field exists anywhere in the output.
5. p95 profile read < 400 ms on representative data.
6. Retraction is invisible on all public surfaces within p95 < 60 s.
7. A full read-model rebuild is byte-identical (S30).

## Verification Commands

```bash
cd back
deno task fmt:check
deno task lint
deno task check
deno task test

cd ../front
pnpm typecheck
pnpm lint
```

Plus the S19 benchmark, S24 retraction timer, and S30 rebuild comparison logs.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Profile becomes a verdict | Typed contract without score; I12 tests; editorial wording review |
| Inheritance overstates scope | Visible scope label + max 2 hops + no multi-hop traversal |
| Read model drifts | `sourceVersions`, rebuild command, repair job, S30 byte comparison |
| Retraction leaves a cached copy | Synchronous invalidation across all surfaces + S24 measurement |
| Client widens projection | Use plan 08 builders; deep-projection negative test |
