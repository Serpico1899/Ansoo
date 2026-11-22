# Plan 11 - Verification, Hardening, and Launch

**Status:** Verification complete; production launch **NO-GO** (2026-11-21)
**Plan:** `docs/plans/11-verification-hardening-and-launch.md`
**Canonical contract:** `../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`
**Evidence:** `docs/reports/evidence/11-verification-hardening-and-launch/`

## 1. Summary

The backend read path is exercised end to end: identifier resolution, public profile assembly, read-model
rebuild, retraction, auth, projections, provenance, publication gates, corrections, and audit. The suite is
green with no ignored tests:

| Check | Result |
|---|---|
| `RUN_MONGO_TESTS=1 deno task test` | **153 passed, 186 steps, 0 failed, 0 ignored** (1m40s) |
| `deno task fmt:check` | Pass, 151 files |
| `deno task lint` | Pass, 150 files |
| `deno task check` | Pass |
| `deno task config:check` (valid env) | Pass |
| `deno task config:check` (missing env) | Fails fast: `MONGO_URL`, `DB_NAME`, `JWT_SECRET` required |
| `cd ../front && pnpm typecheck` | Pass |
| `cd ../front && pnpm lint` | Pass |
| `cd ../front && pnpm build` | Pass; Next.js builds only `/404` (frontend is a scaffold) |

This is **not** a production-ready result. Three mandatory scenarios fail or are unreachable:

- **S15 Dashboard aggregation**: no dashboard/aggregation action exists.
- **S16 Growth**: BSON and query measurements exist, but not on a production-like dataset.
- **S18 Cascade**: no archive/delete/cascade action exists.

The data and legal launch gates remain blocked from plan 10: no defensible primary-source ownership edge,
no named researcher/reviewer, no legal counsel, and no published funding/independence statement.

## 2. Environment

| Item | Value |
|---|---|
| Date | 2026-11-21 (UTC) |
| OS | Linux 7.0.0-43-generic x86_64 |
| CPU | Intel Core i7-6700HQ, 8 logical cores |
| Memory | 7.7 GiB |
| Deno | 2.4.5, V8 13.7.152.14, TypeScript 5.8.3 |
| Lesan | `jsr:@hemedani/lesan@^0.2.3` |
| MongoDB | 8.0.13, single-node replica set `rs0` at `127.0.0.1:27019` |
| mongosh / tools | 2.5.7 / mongodump 100.13.0 |
| Dataset | Deterministic synthetic seed from plan 09; no real corpus |

Evidence: `evidence/11-verification-hardening-and-launch/environment.log`.

## 3. Scenario matrix S01-S30

| ID | Result | Evidence |
|---|---|---|
| S01 Create Brand | **PASS**: normalization keys and audit are written | `tests/identity/entities.integration.test.ts` |
| S02 Product with Brand relation | **PASS**: relation snapshot and reverse preview correct | `tests/identity/entities.integration.test.ts`, `tests/models/relations.integration.test.ts` |
| S03 Change a Product's Brand | **PASS**: old brand preview is empty, new brand preview has the product | `tests/identity/brandMapping.integration.test.ts` (orphan assertions added in plan 11) |
| S04 Brand with >20 Products | **PASS**: preview capped at 20, newest first, authoritative count queried from products | `tests/models/relations.integration.test.ts` |
| S05 Create Organization | **PASS**: closed `kind`, identifiers and aliases validated, no owner field | `tests/models/identity.test.ts` |
| S06 Polymorphic Relationship | **PASS**: endpoint/predicate matrix and context enforced | `tests/research/relationship.integration.test.ts` |
| S07 Close Relationship | **PASS**: `validTo` changes, `recordLifecycle` untouched, audit written | `tests/research/relationship.integration.test.ts` |
| S08 Revision | **PASS**: revision preview capped and newest first; version increments | `tests/research/retraction.integration.test.ts` |
| S09 SourceSnapshot | **PASS**: bytes outside MongoDB, SHA-256 recorded, content identity immutable | `tests/provenance/capture.integration.test.ts` |
| S10 Evidence on Claim | **PASS**: snapshot existence, stance, caps, audit | `tests/provenance/evidence.integration.test.ts` |
| S11 OrganizationResponse | **PASS**: visibility and publication state controlled | `tests/research/response.integration.test.ts` |
| S12 Correction | **PASS**: target, field, operation and value shapes allowlisted | `tests/governance/corrections.integration.test.ts` |
| S13 Concurrency | **PASS**: stale versions return 409 with no partial write | `tests/governance/corrections.integration.test.ts`, `tests/identity/merge.integration.test.ts` |
| S14 Public projection | **PASS**: I04 role x collection x internal-field matrix | `tests/projections/i04.test.ts` |
| S15 Dashboard aggregation | **FAIL**: no dashboard or status-aggregation action is implemented; only five API actions exist | `evidence/.../action-inventory.log` |
| S16 Growth | **FAIL**: representative BSON (Relationship 497 B, Claim 467 B) and read latency recorded, but on a one-product seed, not a production-like dataset | `evidence/.../index-explain.log`, `evidence/.../s19-p99.log` |
| S17 Failure injection | **PASS**: correction write failure rolls back and is repairable | `tests/governance/corrections.integration.test.ts` |
| S18 Cascade | **FAIL**: no archive/delete/cascade action; only archived-target reference checks exist | `evidence/.../action-inventory.log`, `tests/identity/registry.integration.test.ts` |
| S19 Vertical slice | **PASS on synthetic shape**: p50 13.22 ms, p95 17.01 ms, p99 26.20 ms, 5,112 B payload; 1 product / 4 claims / 3 relationships | `evidence/.../s19-p99.log` |
| S20 Merge + redirect | **PASS**: historical refs untouched, max five hops, cycle raises an admin flag | `tests/identity/merge.integration.test.ts`, `tests/identity/registry.integration.test.ts` |
| S21 Self-assessment | **PASS**: `assessedBy = createdBy` returns 403 | `tests/research/assessment.integration.test.ts` |
| S22 Gate FAIL | **PASS**: any failed check blocks publication | `tests/research/gate.integration.test.ts` |
| S23 Right of reply | **PASS**: SENSITIVE publication blocked until response or deadline | `tests/research/response.integration.test.ts` |
| S24 Retraction | **PASS on in-memory surfaces**: 10 runs, p50 424.25 ms, p95 977.75 ms, max 977.75 ms, target < 60,000 ms; CDN/search adapters are in-memory | `evidence/.../s24-retraction-runs.log` |
| S25 Persian normalization | **PASS**: all Section 13.1 vectors | `tests/identity/normalize.test.ts` |
| S26 Array caps | **PASS**: boundary and over-limit return 422 `CAP_EXCEEDED`, never discard | `tests/models/identity.test.ts`, `tests/provenance/evidence.integration.test.ts` |
| S27 50 concurrent evidence writers | **PASS**: 50/50 appends land, no spurious 409, 51st is 422 `CAP_EXCEEDED` | `evidence/.../s27-50-writers.log` |
| S28 Property tests | **PASS for deterministic cases**: interval overlap flag, merge chain/cycle, preview boundedness; no property-based fuzzing framework is installed | `tests/research/relationship.integration.test.ts`, `tests/identity/registry.integration.test.ts`, `tests/models/relations.integration.test.ts` |
| S29 SSRF | **PASS**: literal/private/metadata addresses, DNS answers, redirects, credentials, ports, size/time/redirect caps | `tests/provenance/fetcher.test.ts` |
| S30 Read model rebuild | **PASS**: two rebuilds are byte-identical, 5,112 B, same SHA-256 | `evidence/.../performance-metrics.log` |

Failures stay failures. S15, S16, and S18 have no owner in this execution; they are launch blockers.

## 4. Invariant closure I01-I15

Every invariant now has one green named test. The nine previously ignored placeholders were removed; named
tests were aligned with the suites that actually enforce each rule.

| ID | Named test | Evidence |
|---|---|---|
| I01 | `I01 - Product, Brand, and Organization are distinct identity types` | `tests/invariants/invariants.test.ts` |
| I02 | `I02 - UNKNOWN is not FALSE and NOT_SUPPORTED is not a negative boolean` | same |
| I03 | `I03 - Review, assessment, publication, legal, and campaign statuses stay separate` | same |
| I04 | `I04 - Public projections never return internal data` plus full role/field matrix | `tests/invariants/invariants.test.ts`, `tests/projections/i04.test.ts` |
| I05 | `I05 - SUPPORTED requires evidence and an assessor other than the creator` | `tests/research/assessment.integration.test.ts` |
| I06 | `I06 - PUBLISHED requires a passing publication gate (S22)` | `tests/research/gate.integration.test.ts` |
| I07 | `I07 - SENSITIVE and HIGH_RISK findings require author, assessor, and publisher separation` | same |
| I08 | `I08 - SourceSnapshot content identity is immutable` | `tests/provenance/capture.integration.test.ts` |
| I09 | `I09 - AuditEvent is append-only` plus DB-privilege spec test | `tests/governance/audit.test.ts` |
| I10 | `I10 - Corrections never apply a raw patch (S12/S13/S17)` | `tests/governance/corrections.integration.test.ts` |
| I11 | `I11 - No transitive ownership or control inference without written methodology (S14/S19)` | `tests/publicProfile/profile.integration.test.ts` |
| I12 | `I12 - No universal score, color, badge, or verdict is produced` | `tests/invariants/invariants.test.ts`, `tests/publicProfile/contract.test.ts` |
| I13 | `I13 - Identifiers are strings and leading zeros are preserved` | `tests/identity/identifier.test.ts` |
| I14 | `I14 - Array caps are enforced in validators with 422, never silent discard` | `tests/invariants/invariants.test.ts`, `tests/models/identity.test.ts` |
| I15 | `I15 - Identity merge is tombstone plus redirect; historical references are never rewritten` | `tests/identity/merge.integration.test.ts` |

Mutation checks (remove enforcement, watch the named test fail, restore):

| Invariant | Mutation | Result |
|---|---|---|
| I05 | Disable the author/assessor equality guard | Test fails (`mutation-i05.log`) |
| I06 | Disable the `PUBLISHED` gate requirement | Test fails (`mutation-i06.log`) |
| I08 | Remove both immutability throws | Test fails (`mutation-i08.log`) |

I09's DB-privilege check is a privilege specification, not a live least-privilege MongoDB user. See residual
risks.

## 5. Concurrency and failure injection

| Check | Result | Evidence |
|---|---|---|
| S13 stale version | PASS, 409, no partial write | `tests/governance/corrections.integration.test.ts` |
| S17 mid-operation failure | PASS, rollback and repair path | same |
| S27 50 concurrent appends | PASS, no lost write, no spurious conflict | `evidence/.../s27-50-writers.log` |
| Cap boundary | PASS, 50 accepted, 51st 422 `CAP_EXCEEDED` | same |
| Merge CAS + audit | PASS; no durable outbox exists | `tests/identity/merge.integration.test.ts` |
| Retraction during rebuild/read | PASS for synchronous in-process surfaces; no resurrection | `tests/publicProfile/profile.integration.test.ts` |
| Concurrent correction apply | PASS: same key replays idempotently, second key returns `ALREADY_APPLIED` | `tests/governance/corrections.integration.test.ts` |

A durable outbox and multi-instance retraction propagation are **not implemented**. This is a production
blocker, not a test failure.

## 6. Performance and growth

| Metric | Result | Limit |
|---|---|---|
| S19 profile read p50 / p95 / p99 | 13.22 / 17.01 / 26.20 ms | p95 < 400 ms |
| S24 retraction p50 / p95 (10 runs) | 424.25 / 977.75 ms | p95 < 60,000 ms |
| S30 rebuild | 5,112 B both runs, identical SHA-256 | byte-identical |
| Relationship BSON | 497 B | warn 1 MiB, stop 16 MiB |
| Claim BSON | 467 B | same |
| Index plans | 32/32 named queries use `IXSCAN` | no collection scan |
| Dataset | 1 product, 4 claims, 3 relationships, 1 source, 1 snapshot | production-like required |

**S16 is not satisfied.** The measurements prove the read path on a synthetic shape, not on production
volume. No benchmark was run with thousands of products, relationships, claims, snapshots, and audit events.
The 50,000-product relation-write question from spec 15.3 also remains unmeasured.

## 7. Security and privacy review

| Area | Result | Evidence |
|---|---|---|
| Auth: header, no Bearer, signature/expiry, suspended/closed, DB roles | PASS | `tests/auth/jwt.integration.test.ts`, `tests/api/dispatch.integration.test.ts` |
| Projection: deep request, merged/retracted/restricted, no PII/roles/private keys | PASS | `tests/projections/i04.test.ts`, `tests/api/dispatch.integration.test.ts` |
| SSRF: literal addresses, DNS, redirects, credentials, ports, caps | PASS | `tests/provenance/fetcher.test.ts` |
| Uploads: MIME sniffing, size allowlist, quarantine, signed URL expiry/tampering | PASS | `tests/provenance/capture.integration.test.ts` |
| Audit: append-only, redaction, nested/secret rejection, allowlist | PASS | `tests/governance/audit.test.ts` |
| Corrections: allowlist, operators, idempotency, quota, flood flag | PASS | `tests/governance/corrections.integration.test.ts` |
| Rate limits | PASS in-process; no shared store | `tests/auth`, `tests/governance` |
| Secrets | PASS: config fails closed; repository scan found no production secret | `evidence/.../config-check-fail.log` |
| DB privileges | SPEC ONLY: audit role deny-update/delete is tested as a privilege definition | `tests/governance/audit.test.ts` |
| Backups | PARTIAL: local mongodump/mongorestore drill passed for 100 docs; no PITR or object versioning | `evidence/.../restore-drill.log` |
| Retention / legal hold | PASS at service level | `tests/governance/retention.integration.test.ts` |

### Residual-risk register

| Risk | Owner | Consequence if unaddressed |
|---|---|---|
| No live least-privilege MongoDB user | Backend/Platform | Application credentials could mutate audit or snapshot documents |
| No PITR or object versioning | Operations | Restore point and asset-history guarantees are unproven |
| No shared rate-limit store | Backend/Platform | Horizontal scaling multiplies quotas |
| No production identity provider | Product/Backend | Login remains assertion-exchange only |
| In-process cache/CDN/search invalidation | Platform | Multi-instance retraction can leave stale copies |
| No production metrics/tracing sink | Platform | Gate denials, queue depth, repair count not observable |
| Archived spike has a default HMAC secret | Engineering | Only if archive code is ever mounted; it is not on the production path |
| No WAF/abuse monitoring/incident contact | Operations | Abuse response is manual and undefined |

## 8. Stage gates A-F

| Gate | Result | Evidence |
|---|---|---|
| A Discovery | **PASS**: 11 collections, 5 API actions, versions recorded, delta listed | this report, `environment.log`, `action-inventory.log` |
| B Models | **PASS**: 11 collections, 2 relations, 5 predicates, 3 claim types, caps | `tests/models`, `tests/domain` |
| C Indexes | **PASS**: 32/32 `IXSCAN` | `evidence/.../index-explain.log` |
| D Actions | **PASS at domain-service layer**; only 5 HTTP actions exposed; corrections/assets/search/relationship public reads remain unimplemented API actions | `action-inventory.log`, full suite |
| E Projection/Auth | **PASS**: I04 matrix, capability matrix, dispatcher negatives | `tests/projections/i04.test.ts`, `tests/api`, `tests/auth` |
| F Scenarios | **FAIL**: S15, S16, S18 do not pass | scenario table above |

The ERD is **not** declared production-final.

## 9. Open decisions (spec Section 22)

No decision was silently defaulted. All six remain blocked.

| # | Decision | Status | Owner | Consequence |
|---|---|---|---|---|
| 1 | Co-branding in the target market | BLOCKED | Product/Research | Multi-brand modeling and first-category choice stay unproven |
| 2 | First obtainable identifier schemes | BLOCKED | Product/Research | Coverage and scanner value cannot be forecast |
| 3 | Unique identifier index after real data | BLOCKED, forbidden until proven | Engineering/Domain | Duplicate/GTIN-reuse behavior remains service-controlled |
| 4 | Shared review-queue read model | BLOCKED | Engineering/Product | Queue queries stay direct; scale untested |
| 5 | Transactions or Outbox in real deployment | BLOCKED; no durable outbox exists | Engineering/Platform | Multi-document failure recovery is incomplete |
| 6 | Exact asset retention policy | BLOCKED | Legal/Operations | Purge/legal-hold policy is code-level only, not approved |

Legal launch gate: **BLOCKED**. No legal counsel has reviewed the first sensitive publication or the
researcher safety model. The methodology is a 0.2 draft; funding/independence and symmetric standards are
not published. No Lead Researcher or Reviewer is named.

## 10. Production readiness checklist

| Item | Result |
|---|---|
| MongoDB replica set | PASS in development |
| Backups / PITR / restore test | PARTIAL: local restore drill passed; PITR and object versioning absent |
| Object storage provider + lifecycle/retention | BLOCKED: local dev provider only |
| Secrets management / least-privilege DB users / network policy | BLOCKED |
| Observability: request ids, errors, latency, queue depth, repair, gate denials | PARTIAL: request ids and command summaries exist; no metrics sink |
| Rate limits / abuse monitoring / incident contact | PARTIAL / BLOCKED |
| Deployment and rollback runbook / index migration / type generation in CI | BLOCKED: no CI pipeline or runbook |
| Health checks and fail-fast config | PASS |
| Frontend contract regenerated, no hand-edited types | PASS for types; frontend has only `/404` |
| Documentation: summary, ADRs, methodology, runbook | PARTIAL: runbook missing; methodology draft |
| Signed go/no-go by product, engineering, research, legal | BLOCKED |

## 11. Verification commands

| Command | Result | Log |
|---|---|---|
| `RUN_MONGO_TESTS=1 deno task test` | 153 passed, 186 steps, 0 failed, 0 ignored | `test-full-final.log` |
| `deno task fmt:check` | Pass, 151 files | `fmt-check.log` |
| `deno task lint` | Pass, 150 files | `lint.log` |
| `deno task check` | Pass | `check.log` |
| `deno task config:check` (valid) | Pass | `config-check-pass.log` |
| `deno task config:check` (missing env) | Fails closed | `config-check-fail.log` |
| `cd ../front && pnpm typecheck` | Pass | `front-typecheck.log` |
| `cd ../front && pnpm lint` | Pass | `front-lint.log` |
| `cd ../front && pnpm build` | Pass | `front-build.log` |
| Index/BSON explain | 32/32 IXSCAN; 497/467 B | `index-explain.log` |
| Restore drill | 100/100 docs, index sum preserved | `restore-drill.log` |

## 12. Spec feedback

1. **Section 18.1 is stale.** `rrk-mcp` 0.2.0 does not expose company registration/gazette notices; it
   covers laws, regulations, and court rulings. Plan 10 recorded this. The spec's rasmio/rrk descriptions
   should not be read as a working ownership-evidence path.
2. **Section 15.3 spike questions remain partly unproven.** Relation behavior is verified at small scale;
   the 50,000-product write-amplification and reverse-preview consistency questions are not measured.
3. **Section 24 data targets are unmet.** 100 Products, 20 Brands, and 20 real edges remain at zero because
   primary evidence is blocked. This is an acquisition blocker, not a code defect.
4. **S15/S18 are scenarios without actions.** Either the MVP needs a dashboard/archive action or the spec
   should state they are post-MVP. Do not silently drop them.

## 13. Recommendation

**NO-GO for production launch.**

The engineering foundation is credible: all 15 invariants have green named tests, the I04 projection
matrix holds, the read path is fast on the synthetic shape, retraction is synchronous, and 50 concurrent
evidence writers lose nothing. But the launch gate fails on facts, not opinions:

- No defensible primary-source data or ownership edge (plan 10).
- S15, S16, and S18 fail.
- No legal counsel, named researcher/reviewer, published funding/independence, or signed go/no-go.
- No PITR/object versioning, least-privilege live DB role, shared rate-limit store, or production
  observability.

Re-run this plan after the acquisition, legal, and operations blockers are closed and the S15/S18 actions
and a production-like growth benchmark exist.
