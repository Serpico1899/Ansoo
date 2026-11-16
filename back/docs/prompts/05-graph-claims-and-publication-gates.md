# Agent Prompt - Execute Plan 05 (Graph, Claims, and Publication Gates)

Read `README.md` here, then `../plans/05-graph-claims-and-publication-gates.md`, spec Sections 6-7, 9.3,
10-11, 16, and plans 03-04.

## Mission

Implement the research core: five-predicate Relationship edges, three Claim types, independent status
machines, sensitivity/evidence rules, self-assessment prevention, the PublicationGate, right of reply, and
retraction hooks.

## Sequence

1. **Relationships:** create/end/update with endpoint matrix, required context, no edge rewrite, canonicalKey
   as a helper only, overlap flag not rejection, audit + CAS.
2. **Claims:** add/update, three types only, discriminated structuredValue, relatedEntities cap/registry,
   claim-vs-relationship lint returning `409 USE_RELATIONSHIP_INSTEAD`.
3. **Statuses:** keep lifecycle/validity/review/assessment/publication independent; implement the
   publication truth table; illegal transition -> 409; audit every change.
4. **Sensitivity:** enforce ROUTINE/SENSITIVE/HIGH_RISK evidence and role requirements; independence =
   different publisher and origin.
5. **Assessment:** `SUPPORTED` needs evidence and `assessedBy != createdBy`; self-assessment 403; no
   negative boolean from `NOT_SUPPORTED`.
6. **Gate:** implement every check; `PUBLISHED` requires PASS; waivers only for right-of-reply and
   independent sources, ADMIN + reason + audit; four-eyes/legal are never waivable.
7. **Right of reply:** solicitation with deadline (+14 days default), proof asset, outcome; block SENSITIVE
   publication until response/deadline.
8. **Responses/retraction:** attributed response workflow; retraction sets status/reason/date, audit, and
   invokes the plan 09 invalidation hook; revision preview is bounded and not audit.
9. **Tests/report:** S06-S08, S21-S23, I02/I03/I05/I06/I07; write
   `../reports/05-graph-claims-and-publication-gates.md`.

## Do Not

- Do not add predicates, claim types, or `OTHER_*`.
- Do not infer ultimate ownership or traverse multiple hops in a public path.
- Do not let approval equal application or gate evaluation equal publication.
- Do not waive four-eyes or legal sign-off.
- Do not collapse statuses into one badge.

## Evidence Required

- Endpoint matrix tests and claim boundary lint.
- Publication truth-table tests.
- I05/I06/I07 negative tests.
- Right-of-reply deadline test.
- Audit events for every material transition.
- Verification logs.

## Stop Conditions

Stop if a predicate/claim semantic is unclear, if legal sign-off policy is undefined for a HIGH_RISK
finding, or if publication would be required before the gate is enforceable.
