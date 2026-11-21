# Plan 00 - Backend Delivery Roadmap (v3.1)

**Status:** Active
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` (CT-DOMAIN-SPEC v3.1)
**Summary:** `../summary.md`
**Decisions:** `../adr/`

## Purpose

Sequence the backend work from the existing scaffold to a defensible, auditable MVP vertical slice. Every
plan is executable, testable, and traceable to the v3.1 contract. This roadmap does not restate the domain;
it orders the work and names the gates that must pass before the next plan starts.

## Baseline Facts

- Backend code is **scaffold only**; no production model or action exists.
- Plan 01 (architecture spike) is **complete against the superseded v1/v2 draft**. Lesan/MongoDB mechanics
  and infrastructure findings remain valid; domain decisions that conflict with v3.1 are void.
- Plan 02 is **complete**. The disposable spike is archived under `back/archive/01-architecture-spike/`
  outside every production import path; stale generated declarations and category scaffolds are removed.
- The core model is exactly **11 collections**, **2 Lesan relations**, **5 predicates**, **3 claim types**,
  and **15 invariants** (`I01`-`I15`), each with a named test.
- Data acquisition and research operations are **in scope and equal priority to engineering** (spec
  Sections 18-19). They run in parallel with plans 02-05.

## Plan Index

| Plan | Title | Primary spec | Depends on | Can run in parallel with |
|---|---|---|---|---|
| 01 | Architecture Spike (historical) | old v1/v2 | scaffold | - |
| 02 | Foundation and Invariants (complete) | 1, 2, 4, 23 | none | 10 |
| 03 | Models, Contracts, and Indexes (complete) | 3-10, 17 | 02 | 10 |
| 04 | Identity, Normalization, and Resolution (complete) | 5, 13 | 03 | 10 |
| 05 | Graph, Claims, and Publication Gates (complete) | 6, 7, 10-11, 16 | 03, 04 | 10 |
| 06 | Provenance, Assets, and Capture (complete) | 8, 12, 18 | 03 | 10 |
| 07 | Governance, Audit, Corrections, and Users (complete) | 9, 12, 16 | 03, 05 | 10 |
| 08 | Auth, Projections, and API Contract (complete) | 4, 12, 14 | 03, 07 | 10 |
| 09 | Public Profile, Read Model, and Vertical Slice (complete) | 14, 12, 20 | 04-08 | 10 |
| 10 | Data Acquisition and Research Operations | 18, 19, 21 | none | 02-09 |
| 11 | Verification, Hardening, and Launch | 12, 16, 20, 21, 24 | 02-10 | - |

## Execution Order

```
02 Foundation
  -> 03 Models/Contracts/Indexes
       -> 04 Identity/Resolution
       -> 06 Provenance/Assets        (parallel with 04)
       -> 05 Graph/Claims/Gates       (after 04)
            -> 07 Governance/Audit
                 -> 08 Auth/Projections
                      -> 09 Profile/Read Model/Vertical Slice
                           -> 11 Verification/Launch
10 Data Acquisition  (parallel from week 1; feeds 09 and 11)
```

Plans may be executed in parallel only when their file and model ownership does not overlap. Plan 03 is the
shared model boundary; do not create collections or fields outside it without an ADR.

## Delivery Mapping (Spec Section 21)

| Spec week | Work | Plans |
|---|---|---|
| 1 | Canonical baseline, ADR, invariants + tests, normalization, six critical alignments | 02, 04 |
| 1-3 (parallel) | Data acquisition, 10 brands, minutes/edge, Go/No-Go | 10 |
| 2-4 | Vertical slice S19: scan -> resolution -> profile | 03-09 |
| 4 | Sensitivity, gate, four-eyes, right of reply, retraction, legal review gate | 05, 07, 09 |
| 5-6 | S01-S30 with real + synthetic data, report, revise spec from reality | 11 |

## Stage Gates (Spec Section 20.3)

No one may declare the ERD production-final until all six gates are reported:

| Gate | Meaning | Owning plan |
|---|---|---|
| A - Discovery | Read repo, installed versions, existing models/actions; report delta | 02 |
| B - Models | Eleven collections and embedded contracts match v3.1 | 03 |
| C - Indexes | Every core query has a verified index or documented plan | 03, 11 |
| D - Actions | Domain actions enforce invariants, auth, concurrency, audit | 04-08 |
| E - Projection/Auth | Server-side role x field matrix passes; no public leak | 08 |
| F - Scenarios | S01-S30 executed with evidence | 11 |

## Non-Negotiable Cross-Plan Rules

1. Read the actual installed Lesan version from `deno.lock`; never write an API from memory.
2. Exactly 11 domain collections; no `categories`, `evidence_items`, or `verification_cases`. The only
   derived collection is the technical `product_public_profiles` read model.
3. Exactly 2 Lesan relations: `Product.brand`, `SourceSnapshot.source`.
4. Exactly 5 predicates and 3 claim types; no `OTHER_*` escape hatches.
5. No `score`, badge, verdict, or single legal/ethical conclusion in any projection.
6. No arbitrary database patch; corrections apply only through the allowlisted domain action.
7. Audit Events are append-only; no update or delete path.
8. Public projections are server-side allowlists; client projection requests never widen access.
9. All caps are enforced in validators with `422 CAP_EXCEEDED`; never silent discard.
10. Dates are UTC BSON `Date`; `validTo: null` is not proof of current truth.
11. SourceSnapshot content identity is immutable; changed content is a new snapshot.
12. No `hardCascade`; archive by default; delete children before parents.
13. Never infer ownership, country, nationality, or legal status from a barcode, GS1 prefix, or name.
14. Do not silently answer the six open decisions in spec Section 22.
15. Every plan ends with a report under `../reports/` and passing `deno task fmt:check`, `lint`, `check`,
    `test` (or an explicit statement of what could not run and why).

## Definition of Done for the MVP

- S19 vertical slice works end-to-end: scan/enter identifier -> explicit resolution -> public profile with
  separated identity, findings, evidence, responses, limitations, and unknowns; p95 < 400 ms server-side.
- I01-I15 each have a green, named test.
- S01-S30 executed with evidence; retraction p95 < 60 s; profile rebuild is byte-identical (S30).
- Public projections pass the full role x internal-field matrix (I04).
- Data targets met or explicitly waived with a written decision: 100 Products, 20 Brands, 20 defensible
  edges, and recorded researcher-minutes per edge.
- ADR log, methodology, funding/independence, and symmetric-standards artifacts are published.
- No open decision is silently encoded; each is answered by an ADR or recorded as blocked with an owner.

## Open Decisions (Spec Section 22)

These are the only genuinely open decisions. Plans must surface them, not resolve them:

1. Is co-branding real in the target market?
2. Which identifier schemes are obtainable first?
3. Can a unique identifier index be applied after real data is observed?
4. Does the shared review queue need a read model?
5. Transactions or Outbox in the real deployment?
6. Exact asset retention policy.

## Documentation Contract

- Every active plan has a matching `../prompts/NN-*.md` execution prompt.
- Every completed plan writes `../reports/NN-*.md` with environment, results, evidence, decisions, and
  remaining blockers.
- Plans are updated when reality contradicts them; archived plans are marked historical, not deleted.
- `../summary.md` is the only condensed domain reference. Do not create a second summary.
