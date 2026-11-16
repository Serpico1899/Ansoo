# Plan 05 - Graph, Claims, and Publication Gates (v3.1)

**Status:** Not started
**Depends on:** 03, 04 (evidence writes from 06 for full gate tests)
**Blocks:** 07, 09
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`
**Roadmap:** `00-roadmap.md`

## Purpose

Implement the research core: directed Relationship edges, the three Claim types, the independent status
dimensions and their state machines, sensitivity classification, four-eyes assessment, the PublicationGate,
right-of-reply solicitation, and retraction. This plan is where I05, I06, I07, and the "no verdict" rules
become executable.

## Non-Goals

- No transitive ownership inference or ultimate-control conclusions.
- No legal or campaign modules.
- No public profile assembly; plan 09 consumes the published records.
- No arbitrary predicate, claim type, or status value.

## Pre-Flight

- [ ] Read spec Sections 6, 7, 9.3, 10.1-10.8, 11, 16, 24.
- [ ] Confirm models/contracts and closed enums from plan 03.
- [ ] Confirm the entity resolver from plan 04 is used for every endpoint/target.
- [ ] Confirm the exact installed Lesan API for atomic updates and relation-free document writes.

## Tasks

### 1. Relationship domain actions

- [ ] `relationship.createEdge`: validate subject/predicate/object against the endpoint matrix; required
  context (`ownership.basis` for CONTROLS, market for DISTRIBUTES/IMPORTS_TO_MARKET); forbidden extra keys.
- [ ] `relationship.endEdge`: set `validity.validTo` and a reason; do not touch `recordLifecycle`; write an
  AuditEvent (`RELATIONSHIP_CLOSED`).
- [ ] `relationship.update`: pure fields only, CAS on `version`, allowlisted paths.
- [ ] Owner change is a new edge. Never rewrite the subject of an existing edge.
- [ ] `canonicalKey = subject.type|subject.id|predicate|object.type|object.id|normalizedContextScope` for
  idempotency/duplicate suggestions only; no unique index.
- [ ] Overlap detection returns a review flag; never a rejection or automatic duplicate merge.
- [ ] Record `predicateRegistryVersion = 1` and `recordedAt`.
- [ ] Every create/close/update writes an AuditEvent and increments `version` correctly.

**Exit:** S06, S07 pass; no `SUBSIDIARY_OF`, multi-hop inference, or edge rewrite exists.

### 2. Claim domain actions

- [ ] `claim.add`: validate `about` via the resolver; exactly three claim types; discriminated
  `structuredValue`; required fields per type.
- [ ] `claim.update`: pure fields only, CAS, allowlisted.
- [ ] `relatedEntities` <= 10 and validated by the registry.
- [ ] Reject `OTHER_*` and any unknown claim type.
- [ ] Implement the Claim/Relationship boundary lint: if `structuredValue` has the shape of a permitted
  edge, return `409 USE_RELATIONSHIP_INSTEAD` with a suggested payload.
- [ ] Enforce `statement`/`publicWording` character caps.

**Exit:** only three claim types are representable; the boundary lint prevents researcher drift.

### 3. Status dimensions and transitions

- [ ] Keep `recordLifecycle`, `review.status`, `assessment.outcome`, and `publication.status` independent.
- [ ] Implement the publication transition truth table:

| from \ to | DRAFT | PENDING_REVIEW | PUBLISHED | WITHHELD | RETRACTED |
|---|---|---|---|---|---|
| DRAFT | - | yes (RESEARCHER) | no | yes (RESEARCHER) | no |
| PENDING_REVIEW | yes | - | yes (Gate PASS only) | yes | no |
| PUBLISHED | no | no | - | yes | yes |
| WITHHELD | yes | yes | yes (Gate PASS only) | - | no |
| RETRACTED | no | yes (re-review) | no | no | - |

- [ ] Reject illegal transitions with `409 INVALID_TRANSITION`.
- [ ] CAS on every transition; never update two status dimensions in one unguarded patch.
- [ ] Record `review.lastActionAt`, assignee changes, and `READY_FOR_DECISION` transitions.
- [ ] Write AuditEvent for every status change (`REVIEW_STATUS_CHANGED`, `ASSESSMENT_RECORDED`,
  `PUBLICATION_CHANGED`, `PUBLICATION_GATE_EVALUATED`).

**Exit:** S08 and I03 pass; a status change cannot silently change another dimension.

### 4. Sensitivity and minimum evidence

- [ ] Implement the classification matrix:

| Sensitivity | Examples | Minimum evidence | Required roles | Right of reply |
|---|---|---|---|---|
| `ROUTINE` | MANUFACTURES from package label; MARKET_PRESENCE from official list | 1 verified snapshot | author != assessor | not required |
| `SENSITIVE` | OWNS, CONTROLS, IMPORTS_TO_MARKET, DISTRIBUTES, conflicting PRODUCT_ORIGIN | 2 independent sources or 1 official registry snapshot (Tier A/B) | author != assessor != publisher | response received or deadline elapsed |
| `HIGH_RISK` | control chains, state/quasi-state linkage, named natural person, legal exposure | 2 independent sources including >=1 official | four-eyes + LEGAL_REVIEWER sign-off | required; waiver only with written ADMIN reason |

- [ ] "Independent" means different publisher and different origin; republications of one wire story count
  as one source.
- [ ] Reject an under-evidenced `SUPPORTED` assessment (I05).
- [ ] Reject self-assessment: `assessedBy === createdBy` -> `403` (I05, S21).
- [ ] Reject missing legal sign-off for HIGH_RISK; it is not waivable.

**Exit:** the sensitivity matrix is enforced in code, not prose; self-assessment and under-evidence fail.

### 5. Assessment workflow

- [ ] `relationship.assess` and `claim.assess`: require `methodologyVersion`, outcome, summary, limitations;
  `assessedBy` from the authenticated principal.
- [ ] `SUPPORTED` requires >=1 `EvidenceLink` and `assessedBy != createdBy`.
- [ ] `PARTIALLY_SUPPORTED` requires narrowed public wording.
- [ ] `NOT_SUPPORTED` must remain neutral: no negation field, no "FALSE" boolean.
- [ ] `DISPUTED` requires conflicting evidence or interpretations, not a user complaint.
- [ ] `NOT_ASSESSED` is a valid outcome and must not block non-public research.
- [ ] Assessment changes are CAS + state-machine guarded + audited.

**Exit:** I02 and I05 pass; no code path converts an outcome into a negative boolean.

### 6. PublicationGate

- [ ] Implement `PublicationGate` with `gateVersion`, `evaluatedAt`, `sensitivity`, checks, result,
  failures, waivers.
- [ ] Required checks: `evidenceCountOk`, `independentSourcesOk`, `assessmentOk`, `fourEyesOk`,
  `legalSignOffOk`, `rightOfReplyOk`, `publicWordingOk`, `sourceAccessOk`, `noScoreOk`.
- [ ] `PUBLISHED` requires `result = PASS` (I06, S22). Direct transition -> `409`.
- [ ] Waivers only for `rightOfReplyOk` and `independentSourcesOk`, only by ADMIN, with written reason and
  AuditEvent (`GATE_WAIVER_GRANTED`).
- [ ] `fourEyesOk` and `legalSignOffOk` can never be waived.
- [ ] A failed check blocks publication even if every other check passes.
- [ ] Gate re-evaluation is required after material evidence/wording changes.

**Exit:** I06, I07, S22 pass; no waiver bypasses four-eyes or legal sign-off.

### 7. Right of reply

- [ ] Implement `ResponseSolicitation` creation with organization, channel, `sentAt`, `assertionsSummary`,
  `responseDeadline` default +14 days, and proof asset.
- [ ] Record outcomes `PENDING`, `RESPONDED`, `NO_RESPONSE`, `DECLINED`, `UNDELIVERABLE`.
- [ ] Link a response to its solicitation; keep the response as an attributed position, not a verdict.
- [ ] Block SENSITIVE publication until a response arrives or the deadline elapses (S23).
- [ ] HIGH_RISK requires legal review and a documented waiver path by ADMIN only.
- [ ] Audit `SOLICITATION_SENT` and `SOLICITATION_OUTCOME_RECORDED`.
- [ ] Enforce `responseSolicitations[]` cap and `organizationResponses[]` cap.

**Exit:** S23 passes; "we asked and they did not reply" is provable from stored artifacts.

### 8. Organization responses

- [ ] Add response with respondent org validation, text cap, received-via, source snapshot/attachments,
  representative verification, publication status, reviewer.
- [ ] A response never changes assessment automatically; it is displayed separately.
- [ ] `PUBLIC` responses require reviewer approval and safe attachment visibility.
- [ ] Audit `ORG_RESPONSE_ADDED` and `ORG_RESPONSE_PUBLICATION_CHANGED`.

**Exit:** S11 passes; respondent identity and representative authority remain separate questions.

### 9. Retraction and revision preview

- [ ] `retract` sets `publication.status = RETRACTED`, reason, date, and writes an AuditEvent.
- [ ] Trigger synchronous read-model/cache/index invalidation owned by plan 09; expose the hook here.
- [ ] `recentRevisionPreview` is bounded (cap 20), sorted newest first, and written on material changes.
- [ ] Revision previews are not the audit history and cannot replace AuditEvents.
- [ ] Audit `FINDING_RETRACTED` and `PUBLIC_WORDING_CHANGED`.

**Exit:** S24 can be exercised; a retracted finding is not returned as published.

### 10. Tests and report

- [ ] Tests: S06, S07, S08, S21, S22, S23, I02, I03, I05, I06, I07.
- [ ] Negative tests for illegal transitions, unknown predicates/types, missing context, cross-endpoint
  edges, self-assessment, under-evidence publish, waivable/non-waivable checks, and superseded wording.
- [ ] Write `reports/05-graph-claims-and-publication-gates.md`.

## Deliverables

1. Relationship and Claim actions with closed registries.
2. Independent status state machines and CAS guards.
3. Sensitivity matrix, assessment rules, and self-assessment prevention.
4. PublicationGate with non-waivable checks.
5. Right-of-reply and organization-response workflows.
6. Retraction hook and revision previews.
7. `reports/05-graph-claims-and-publication-gates.md`.

## Acceptance Criteria

1. Exactly five predicates and three claim types exist.
2. I02, I03, I05, I06, and I07 pass with named tests.
3. A finding cannot be published without Gate PASS; four-eyes/legal checks cannot be waived.
4. SENSITIVE publication is blocked until response or deadline; HIGH_RISK requires legal sign-off.
5. Illegal status transitions return 409 and never mutate another status dimension.
6. Every material transition writes an AuditEvent.

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
| Predicate/claim semantics drift | Closed enums + endpoint matrix + boundary lint |
| Status dimensions collapse | Separate fields, separate actions, transition table tests |
| Gate becomes a formality | Checks are code, failures are recorded, waivers are narrow and audited |
| Right of reply is skipped | Deadline enforcement in the gate, proof asset required |
| Retraction leaves stale public data | Plan 09 synchronous invalidation hook; S24 evidence |
