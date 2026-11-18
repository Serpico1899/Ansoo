# Plan 05 - Graph, Claims, and Publication Gates (v3.1) - Report

**Status:** Complete (2026-11-18)
**Plan:** `docs/plans/05-graph-claims-and-publication-gates.md`
**Canonical contract:** `../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` (CT-DOMAIN-SPEC v3.1)
**Evidence:** `docs/reports/evidence/05-graph-claims-and-publication-gates/`

## 1. Environment

| Item              | Value                                                       |
| ----------------- | ----------------------------------------------------------- |
| OS                | Ubuntu 24.04.2 LTS (x86_64)                                 |
| Runtime           | Deno 2.4.5                                                  |
| Backend framework | Lesan 0.2.3 (`jsr:@hemedani/lesan@0.2.3`)                   |
| Database          | MongoDB 8.0.13, single-node replica set `rs0` on port 27019 |
| Test databases    | `ansoo_plan05_*` (created and dropped by each run)          |

Commands used:

```bash
deno task db:dev
deno task fmt
deno task fmt:check
deno task lint
deno task check
RUN_MONGO_TESTS=1 deno test --allow-all tests/research/
RUN_MONGO_TESTS=1 deno task test
```

## 2. Results by task

### Task 1 - Relationship graph edges

**Pass.** `utils/research/relationship.ts` validates the closed five-predicate matrix, endpoint types,
required context (`CONTROLS` needs `ownership.basis`; `DISTRIBUTES`/`IMPORTS_TO_MARKET` need a market),
and rejects unknown context keys. Creation stores `predicateRegistryVersion`, `recordedAt`, `canonicalKey`,
and an overlap review flag; overlap is never a rejection. `endRelationshipEdge` sets
`validity.validTo` only and preserves `recordLifecycle`; `updateRelationship` cannot rewrite endpoints.
Owner changes are new edges. Evidence: `test-research.log`, S06/S07 cases.

### Task 2 - Claims and the claim/relationship boundary

**Pass.** `utils/research/claim.ts` accepts exactly `MARKET_PRESENCE`, `PRODUCT_ORIGIN`, and
`OFFICIAL_STATEMENT`, validates each structured-value contract, enforces the claim type/`about` matrix,
and rejects unknown fields. An edge-shaped claim (owner/control/manufacture/distribution) fails with
`409 USE_RELATIONSHIP_INSTEAD` and a suggested relationship payload. Claim updates are CAS-guarded and
audited. Evidence: `claim.integration.test.ts`.

### Task 3 - Independent status machines

**Pass.** `utils/research/status.ts` exposes separate `transitionReview` and `transitionPublication`
paths. Review, assessment, publication, and `recordLifecycle` never overwrite each other. Publication
uses the explicit `DRAFT`/`PENDING_REVIEW`/`PUBLISHED`/`WITHHELD`/`RETRACTED` truth table. Publish and
retract require `MODERATOR`/`ADMIN`; publication requires a current `PASS` gate with matching sensitivity
and `evaluatedAt >= updatedAt`. SENSITIVE/HIGH_RISK publication requires three distinct people
(author, assessor, publisher). Evidence: `status.integration.test.ts`, I03/I06.

### Task 4 - Sensitivity classification

**Pass.** `utils/research/sensitivity.ts` classifies `MANUFACTURES` and non-routine `MARKET_PRESENCE` as
`SENSITIVE`; `HIGH_RISK` requires an explicit request. Callers may raise sensitivity but never lower it.
Evidence: `assessment.integration.test.ts`.

### Task 5 - Evidence and assessment

**Pass.** `utils/research/evidence.ts` counts verified evidence and computes independence as
`min(unique publishers, unique origins)`. SENSITIVE requires two independent sources or one official
registry snapshot; HIGH_RISK requires two independent sources and one official source. `assessment.ts`
prevents self-assessment (author != assessor), supports `SUPPORTED`, `PARTIALLY_SUPPORTED`,
`NOT_SUPPORTED`, `DISPUTED`, and `INCONCLUSIVE` with neutral wording, requires public wording for partial
support, and requires conflicting evidence for `DISPUTED`. A response never changes the assessment.
Evidence: `assessment.integration.test.ts`, I02/I05/S21.

### Task 6 - PublicationGate

**Pass.** `utils/research/gate.ts` records all nine checks (`evidenceCountOk`, `independentSourcesOk`,
`assessmentOk`, `fourEyesOk`, `legalSignOffOk`, `rightOfReplyOk`, `publicWordingOk`, `sourceAccessOk`,
`noScoreOk`). Any non-waived failure yields `FAIL`; publication reads only a current `PASS`. Waivers are
limited to `rightOfReplyOk` and `independentSourcesOk`, require an ADMIN, a written reason, and a
`GATE_WAIVER_GRANTED` event. Four-eyes and legal sign-off are never waivable. HIGH_RISK legal sign-off is
an append-only `REVIEW_STATUS_CHANGED` event with `changedPaths:["legalSignOff"]` and
`afterSummary.legalSignOff=true`. Restricted sources fail `sourceAccessOk`. Evidence:
`gate.integration.test.ts`, I06/I07/S22.

### Task 7 - Right of reply

**Pass.** `utils/research/response.ts` creates solicitations with organization, channel,
`assertionsSummary`, sent time, proof asset, and a deadline defaulting to `sentAt + 14 days`. Outcomes
`PENDING`, `RESPONDED`, `NO_RESPONSE`, `DECLINED`, and `UNDELIVERABLE` are recorded with CAS and audit.
A response links to its solicitation; `rightOfReplySatisfied` treats `RESPONDED`/`DECLINED` as satisfied
and `NO_RESPONSE`/`UNDELIVERABLE` only after the deadline. `responseSolicitations` is capped at 10.
Evidence: `response.integration.test.ts`, S23.

### Task 8 - Organization responses

**Pass.** Responses validate respondent organization, text cap (`10,000`), received-via, source snapshot,
and attachment assets. `PUBLIC` responses require a reviewer role and only `PUBLIC_APPROVED`, `READY`,
`ACTIVE`, `exifStripped` assets without legal hold. Representative verification is separate from
identity; `VERIFIED`/`DISPUTED` requires a reviewer. Responses are attributed positions and never mutate
the finding assessment. `organizationResponses` is capped at 20. Evidence:
`response.integration.test.ts`, S11.

### Task 9 - Retraction, invalidation, and revision previews

**Pass.** `retractFinding` authenticates the publisher, checks the expected version and `PUBLISHED`
state, synchronously purges matching `product_public_profiles` documents through
`utils/research/invalidation.ts`, then sets `publication.status = RETRACTED` with reason and date. It
appends `FINDING_RETRACTED`. The invalidation hook is injectable for plan 09. `recentRevisionPreview` is
capped at 20 and newest first; previews never replace audit events. Evidence:
`retraction.integration.test.ts`, S24.

### Task 10 - Tests and report

**Pass.** Research tests cover S06, S07, S08 (status independence), S11, S21, S22, S23, S24, I02, I03,
I05, I06, I07, and negative paths: illegal transitions, unknown predicates/claim types, missing context,
wrong endpoints, self-assessment, under-evidenced publication, non-waivable checks, stale gates, unsafe
attachments, and unauthorized actions.

## 3. Decisions

1. **Domain services now, HTTP triads in plan 08.** The plan-05 services accept a server-controlled
   actor, enforce roles, CAS, caps, and audit, and are ready to be wrapped by plan 08 actions.
2. **Publish/retract require `MODERATOR`/`ADMIN`.** Legal sign-off requires `LEGAL_REVIEWER`/`ADMIN`.
   This is the provisional capability matrix until plan 08 formalizes it.
3. **Legal sign-off has no canonical field.** It is recorded as an append-only
   `REVIEW_STATUS_CHANGED` event (`changedPaths:["legalSignOff"]`); the gate reads the latest event.
4. **`sourceAccessOk` means every cited snapshot resolves to a `PUBLIC` source.**
5. **Retraction purges the read model synchronously through an injectable hook.** Plan 09 can replace
   the default `product_public_profiles` purge without changing the retraction contract.

## 4. Measurements

| Measurement                         | Result                                      |
| ----------------------------------- | ------------------------------------------- |
| Research tests                      | 18 passed (33 steps), 0 failed              |
| Full unit/invariant/integration run | 107 passed (89 steps), 0 failed, 10 ignored |
| Publication gate checks             | 9                                           |
| Waivable gate checks                | 2 (`rightOfReplyOk`, `independentSourcesOk`) |
| Non-waivable gate checks            | 2 (`fourEyesOk`, `legalSignOffOk`)           |
| Response deadline default           | 14 days                                     |
| `responseSolicitations` cap         | 10                                          |
| `organizationResponses` cap         | 20                                          |
| `recentRevisionPreview` cap         | 20                                          |

The 10 ignored tests on the default run are pre-existing Mongo-gated cases; all research integrations run
with `RUN_MONGO_TESTS=1`.

## 5. Security negative tests

- Unknown predicates, claim types, endpoint types, context keys, and response fields fail closed.
- Edge-shaped claims are rejected with `409 USE_RELATIONSHIP_INSTEAD`.
- Endpoint rewrites, relation deletion, and `recordLifecycle` changes are not exposed by pure updates.
- Self-assessment and non-distinct four-eyes are rejected.
- Publication without a current PASS gate, with restricted sources, or with a stale gate is rejected.
- Waivers are ADMIN-only, reasoned, audited, and cannot waive four-eyes or legal sign-off.
- Unsafe or private response attachments cannot become `PUBLIC`.
- Unauthorized retraction does not purge the public read model.
- Caps are `422 CAP_EXCEEDED`; nothing is silently truncated.

Evidence: `test-research.log`, `test-mongo.log`.

## 6. Blocked/open items

None for plan 05. Plan 08 must register the HTTP action triads and inject the authenticated actor. Plan 09
owns the full public read model and may replace the default invalidation hook. No collection, field,
predicate, relation, or open-decision answer was added.

## 7. Files changed

Production:

- `utils/research/common.ts`, `sensitivity.ts`, `relationship.ts`, `claim.ts`, `status.ts`,
  `evidence.ts`, `assessment.ts`, `gate.ts`, `response.ts`, `invalidation.ts`, `mod.ts`

Tests and evidence:

- `tests/research/relationship.integration.test.ts`, `claim.integration.test.ts`,
  `status.integration.test.ts`, `assessment.integration.test.ts`, `gate.integration.test.ts`,
  `response.integration.test.ts`, `retraction.integration.test.ts`
- `docs/reports/evidence/05-graph-claims-and-publication-gates/`

No models, generated declarations, frontend files, or archive files were changed.

## 8. Verification

| Command                  | Result                                     | Evidence          |
| ------------------------ | ------------------------------------------ | ----------------- |
| `deno task fmt:check`    | Pass, 81 files checked                     | `fmt-check.log`   |
| `deno task lint`         | Pass, 80 files checked                     | `lint.log`        |
| `deno task check`        | Pass                                       | `check.log`       |
| Research test run (Mongo) | 18 passed (33 steps), 0 failed            | `test-research.log` |
| `deno task test` (Mongo) | 107 passed (89 steps), 0 failed, 10 ignored | `test-mongo.log`  |
