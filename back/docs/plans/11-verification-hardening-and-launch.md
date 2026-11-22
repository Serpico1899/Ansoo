# Plan 11 - Verification, Hardening, and Launch (v3.1)

**Status:** Verification complete; launch NO-GO (2026-11-21)
**Depends on:** 02-10
**Blocks:** production launch
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`
**Roadmap:** `00-roadmap.md`

## Purpose

Prove the system against the full spec: execute S01-S30, complete stage gates A-F, measure performance and
BSON growth, close or explicitly block the six open decisions, harden security/operations, and decide
whether the MVP is ready for real users. This is the final gate, not a feature plan.

## Non-Goals

- No new domain collections or fields without an ADR.
- No legal/campaign modules.
- No launch of write-heavy research workflows while policy questions remain unanswered.
- No claim of success without recorded evidence.

## Pre-Flight

- [x] Read spec Sections 12, 16, 20-24.
- [x] Confirm plans 02-10 are complete and their reports exist.
- [ ] BLOCKED: only the deterministic synthetic seed exists; no production-like corpus.
- [ ] BLOCKED: no legal counsel, Lead Researcher, or Reviewer is named.

## Tasks

### 1. Scenario matrix S01-S30

Execute every scenario and record: command, environment, observed result, expected result, pass/fail,
evidence path.

| ID | Scenario | Acceptance criterion |
|---|---|---|
| S01 | Create Brand | validation + normalization correct |
| S02 | Product with Brand relation | snapshot and reverse preview correct |
| S03 | Change a Product's Brand | no orphan preview remains |
| S04 | Brand with >20 Products | preview respects cap and sort |
| S05 | Create Organization | kind and identifiers validated |
| S06 | Polymorphic Relationship | endpoint compatibility enforced |
| S07 | Close Relationship | `validTo` changes, `recordLifecycle` untouched, audit written |
| S08 | Revision | preview bounded, version incremented |
| S09 | SourceSnapshot | bytes outside MongoDB, hash correct |
| S10 | Evidence on Claim | snapshot exists, stance stored |
| S11 | OrganizationResponse | visibility controlled |
| S12 | Correction | target and `proposedChange` validated |
| S13 | Concurrency | version mismatch -> 409 |
| S14 | Public projection | no internal field for any weak role |
| S15 | Dashboard aggregation | counts per status correct |
| S16 | Growth | BSON size and query time recorded |
| S17 | Failure injection | mid-operation failure leaves no permanent inconsistency |
| S18 | Cascade | deletion/archive safe |
| S19 | Vertical slice: scan GTIN -> full profile | correct answer, evidence, separated statuses, p95 < 400 ms |
| S20 | Merge + redirect | historical refs untouched; chain/cycle handling correct |
| S21 | Self-assessment | `assessedBy = createdBy` -> 403 |
| S22 | Gate FAIL | any failed check blocks publication |
| S23 | Right of reply | deadline not elapsed -> SENSITIVE publication blocked |
| S24 | Retraction | p95 < 60 s to full removal from document/read model/cache/index |
| S25 | Persian normalization | all 13.1 vectors pass |
| S26 | Array caps | 422, not discard |
| S27 | 50 concurrent evidence writers | no append lost; zero spurious conflicts |
| S28 | Property tests | interval overlap, merge-chain cycles, preview boundedness |
| S29 | SSRF | all forbidden addresses blocked, including redirects and DNS rebinding |
| S30 | Read model rebuild | full rebuild from canonical collections, byte-identical output |

- [x] Run each scenario against real and synthetic data where appropriate. S15, S16, and S18 fail.
- [x] Keep tests deterministic and isolated; no shared mutable database state.
- [x] Record failures as failures; do not mark a scenario pass from intent.

**Exit:** every scenario has a result and an evidence path; failures have owners.

### 2. Invariant closure

- [x] Verify I01-I15 each have a green named test. All 15 now run; 0 ignored.
- [x] Verify the test fails when the enforcement is removed (mutation check for the critical invariants). I05, I06, I08 mutation-checked.
- [x] Verify I04 covers every role (including guest) x every internal field.
- [x] Verify I09 at the DB privilege layer, not only the service. Privilege specification only; no live least-privilege role yet.
- [x] Record the invariant-to-test-to-scenario map. See report 11 section 4.

**Exit:** no invariant is prose-only.

### 3. Concurrency and failure injection

- [x] S13: stale version -> 409; no partial write.
- [x] S17: inject failure between target write and correction/audit write; repair leaves no permanent
  inconsistency.
- [x] S27: 50 concurrent evidence appends; no lost write and no spurious conflict.
- [x] Test commutative appends at the cap boundary; exceed -> 422.
- [ ] PARTIAL: merge CAS and audit are tested; no durable outbox exists.
- [x] Test retraction during concurrent rebuild and read. In-process surfaces only.
- [x] Test concurrent correction application with the same and different idempotency keys.

**Exit:** concurrency and crash windows are evidenced, not assumed.

### 4. Performance and growth

Measure with a production-like dataset and record hardware, OS, Deno, Lesan, MongoDB, document count,
payload size, and query type:

- [x] Identifier lookup, product listing, relationship lists, research queues, snapshot history, audit
  queries, public profile read. Index plans and S19 measured; no production-like volume.
- [x] p50/p95/p99 for public profile; target < 400 ms. 13.22 / 17.01 / 26.20 ms on the synthetic seed.
- [x] Retraction end-to-end; target < 60 s. 10 runs, p95 977.75 ms on in-memory surfaces.
- [ ] NOT MEASURED: no production outbox, repair job, or metrics sink.
- [x] BSON size of representative Relationship/Claim; warn before 1 MiB, hard stop before 16 MiB. 497 / 467 B.
- [x] `explain("executionStats")` for every core query; no collection scan. 32/32 IXSCAN.
- [ ] BLOCKED: plan 10 produced zero completed edges.

**Exit:** performance targets met or explicitly renegotiated with a written reason.

### 5. Security and privacy review

- [x] Auth: DB roles, token header, no `Bearer`, expired/bad signature, suspended/closed, inflated claims.
- [x] Projection: deep client request, merged/retracted/restricted cases, no PII/roles/private keys/score.
- [x] SSRF: direct, redirect, DNS rebinding, credentials, port/scheme, body/redirect caps.
- [x] Uploads: MIME sniffing, size/type allowlist, quarantine, EXIF, signed URL expiry/tampering.
- [x] Audit: append-only, redaction, no nested summaries, no PII/secrets.
- [x] Corrections: allowlist, operators, `$where`/prototype pollution, idempotency, quota.
- [x] Rate limits and abuse flags. In-process only; no shared store.
- [x] Secrets: no defaults, no repo secrets, rotation documented.
- [ ] SPEC ONLY: privilege definitions pass; no live least-privilege user is provisioned.
- [ ] PARTIAL: local mongodump/mongorestore drill passed; PITR and object versioning are not configured.
- [x] Retention/purge: legal hold respected; policy decision recorded. Service-level only.

**Exit:** security negatives pass and residual risks are listed with owners.

### 6. Stage gates A-F

- [x] A Discovery: report current structure, installed versions, delta against spec.
- [x] B Models: 11 collections, 2 relations, 5 predicates, 3 claim types, contracts, caps.
- [x] C Indexes: every core query index-backed or documented.
- [x] D Actions: invariants, auth, concurrency, audit, idempotency enforced at the domain-service layer; only five HTTP actions are exposed.
- [x] E Projection/Auth: role x field matrix passes; no leak.
- [ ] FAIL: S15, S16, and S18 do not pass.
- [x] Write the stage-gate report and link every claim to evidence.

**Exit:** all six gates are reported; no gate is skipped.

### 7. Open decisions and legal launch gate

Review the six genuinely open decisions from spec Section 22:

1. [ ] Co-branding in the target market.
2. [ ] First obtainable identifier schemes.
3. [ ] Unique identifier index after real data.
4. [ ] Shared review-queue read model.
5. [ ] Transactions or Outbox in the real deployment.
6. [ ] Exact asset retention policy.

- [x] Each decision is answered by an ADR or recorded as blocked with an owner and consequence. All six are blocked with owners.
- [x] No decision is silently encoded in code or defaults.
- [ ] BLOCKED: no legal counsel is engaged.
- [ ] BLOCKED: methodology is a 0.2 draft; funding and symmetric standards are not published.
- [ ] BLOCKED: no names accepted.

**Exit:** launch is legally and operationally defensible, or explicitly blocked.

### 8. Production readiness checklist

- [ ] PARTIAL: replica set and a local restore drill pass; PITR is absent.
- [ ] BLOCKED: local dev provider only.
- [ ] BLOCKED: no production secrets manager or DB user.
- [ ] PARTIAL: request ids and command summaries exist; no metrics sink.
- [ ] PARTIAL: in-process rate limits and flood flag; no shared store or incident contact.
- [ ] BLOCKED: none of the three exists.
- [x] Health checks and fail-fast config.
- [x] Frontend contract regenerated from production models; no hand-edited types.
- [ ] PARTIAL: summary, ADRs, and methodology draft exist; runbook is missing.
- [ ] BLOCKED: recommendation is unsigned; legal and research owners are unavailable.

**Exit:** the launch checklist is complete or every open item has an explicit owner and date.

### 9. Final report and spec feedback

- [x] Write `reports/11-verification-hardening-and-launch.md`.
- [x] Include S01-S30 results, invariants, performance, security, stage gates, open decisions, launch
  recommendation, and residual risks.
- [x] Record where reality contradicts the spec; propose spec edits through the ADR process.
- [x] Do not declare the ERD production-final before all stage gates are reported.

## Deliverables

1. S01-S30 evidence matrix.
2. I01-I15 closure evidence.
3. Concurrency/failure-injection results.
4. Performance/BSON report with environment metadata.
5. Security/privacy review and residual-risk register.
6. Stage-gate A-F report.
7. Open-decision register and legal launch gate.
8. Production readiness checklist and final go/no-go.
9. `reports/11-verification-hardening-and-launch.md`.

## Acceptance Criteria

1. S01-S30 have recorded results; failures are not hidden.
2. I01-I15 each have a green named test.
3. Stage gates A-F are complete.
4. Performance targets are met or renegotiated in writing.
5. Every open decision is answered or blocked with an owner.
6. Legal counsel has reviewed the first sensitive publication.
7. The launch recommendation is evidence-based and signed by the required owners.

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
pnpm build
```

Plus the scenario, benchmark, restore-test, and security evidence logs.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Scenarios marked pass without evidence | Evidence path required per row; reviewer sign-off |
| Concurrency bugs hidden by low load | 50-writer test; failure injection; idempotency ledger |
| Performance regressions | Record hardware/versions; re-run after index changes |
| Security drift | Full negative suite; least-privilege DB; projection matrix |
| Launch without legal review | Hard gate; no sensitive publication until sign-off |
| Open decision silently defaulted | Register every decision; block launch until owned |
