# Plan 07 - Governance, Audit, Corrections, and Users (v3.1) - Report

**Status:** Complete (2026-11-18)
**Plan:** `docs/plans/07-governance-audit-corrections-and-users.md`
**Canonical contract:** `../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` (CT-DOMAIN-SPEC v3.1)
**Evidence:** `docs/reports/evidence/07-governance-audit-corrections-and-users/`

## 1. Environment

| Item              | Value                                                       |
| ----------------- | ----------------------------------------------------------- |
| OS                | Linux (x86_64)                                              |
| Runtime           | Deno 2.4.5                                                  |
| Backend framework | Lesan 0.2.3 (`jsr:@hemedani/lesan@0.2.3`)                   |
| Database          | MongoDB 8.0.13, single-node replica set `rs0` on port 27019 |
| Test databases    | `ansoo_plan07_*` (created and dropped by each run)          |

Commands used:

```bash
deno task fmt:check
deno task lint
deno task check
RUN_MONGO_TESTS=1 deno test --allow-all tests/governance/
RUN_MONGO_TESTS=1 deno task test
```

## 2. Results by task

### Task 1 - Audit repository (I09)

**Pass.** `utils/governance/audit.ts` exposes `appendAuditEvent` and `listAuditEvents`, plus a frozen
`auditRepository` containing only `append` and `list`. There is no update or delete function. Every append
validates the closed `AUDIT_ACTIONS` enum, resolves the target through `createEntityRegistry`, rejects
unknown input keys, records `requestId`/`correlationId`/optional `idempotencyKey`, version before/after,
`changedPaths`, and actor identity. `auditPrivileges.ts` defines the least-privilege `ansooApp` role with
`find` and `insert` only on `audit_events`; the test asserts the role spec has no update/remove action.
Summaries are flat and per-action allowlisted; nested objects, arrays, forbidden keys, control characters,
secret-like strings, emails, bearer tokens, JWTs, private keys, AWS keys, and Mongo URLs are rejected.
Evidence: `audit.test.ts`, `audit-coverage.test.ts`.

### Task 2 - Audit coverage

**Pass.** `utils/governance/auditCoverage.ts` maps every mutation action in the closed audit enum to at
least one test file, and `audit-coverage.test.ts` fails if an action loses coverage or a governance action
is not exercised. Multi-step workflows use `correlationId` where applicable (for example
`correction:<id>` on application). Summaries never contain raw documents. Evidence:
`audit-coverage.test.ts`.

### Task 3 - Correction submission (S12)

**Pass.** `submitCorrection` accepts only `CORRECT_EXISTING`, `ADD_MISSING`, `RETRACT`, and `REPORT_ISSUE`.
Existing targets are required except for `ADD_MISSING`; targets and proposed entities are resolved through
the registry. `correctionPolicy.ts` allowlists `fieldKey` per target type, validates `SET`, `UNSET`,
`ADD_RELATIONSHIP`, and `END_RELATIONSHIP`, validates values by `(targetType, fieldKey)`, and rejects
operators, dotted paths, unknown fields, and free-form JSON with `422`. Reasons are required (2,000 char
cap); evidence references are capped at 10 and validated against snapshots/assets/URLs/notes. Submission is
idempotent per submitter and key, uses server time, records an HMAC-shaped IP hash, enforces 10/day/user and
30/day/IP with a consistent `429 RATE_LIMITED` envelope, and flags coordinated flood suspicion to
moderators without penalizing anyone. `CORRECTION_SUBMITTED` is audited. Evidence: `corrections.integration.test.ts`
(S12, quota, flood).

### Task 4 - Correction review

**Pass.** `assignCorrection` and `decideCorrection` require reviewer roles. Decisions accept only
`IN_REVIEW`, `NEEDS_INFORMATION`, `APPROVED`, and `REJECTED`. The submitter cannot approve their own
correction (`403 SELF_APPROVAL`). `withdrawCorrection` is submitter-only and only before a terminal
decision. Review records `assignedTo`, `reviewedBy`, `reviewedAt`, and `decisionReason`. Approval updates
only review metadata and increments the correction version; the target's content and version stay
unchanged. `CORRECTION_REVIEWED` is audited for both assignment and decision. Evidence:
`corrections.integration.test.ts`.

### Task 5 - Correction application (I10, S13, S17)

**Pass.** `applyCorrection` requires `APPROVED`, reviewer authorization, an expected correction version, an
expected target version, and an application idempotency key. It revalidates the proposal against the
allowlist at application time. A stale target returns `409 VERSION_CONFLICT` and records a `FAILED`
application with before/after versions and reason; a failed attempt remains retryable with a new key, while
the same key replays the ledger. Successful application writes the target through a built patch (never a
raw `proposedValue` `$set`), uses CAS on `version`, writes the correction application ledger, and appends
`CORRECTION_APPLIED` inside one MongoDB transaction. A unique sparse index on
`application.idempotencyKey` backs repeated-apply safety. A repeated apply with the same key is an
idempotent replay; a different key on an applied correction is `409 ALREADY_APPLIED`. The
`afterTargetWrite` failure-injection hook proves that a crash after the target write rolls back both target
and correction and can be repaired by a later application. For a published claim/relationship whose
`publicWording` changes, the action returns a spec-shaped `PublicCorrectionNotice` (`correctedAt`, `reason`,
`previousWording`, `auditEventId`) for plan 09, plus the target and action for routing. Evidence:
`corrections.integration.test.ts` (S13, S17, idempotency, public notice).

### Task 6 - Users, roles, and PII

**Pass.** `utils/governance/user.ts` validates the six roles and the trust/status enums, uses versioned
compare-and-set updates, and audits `USER_ROLES_CHANGED`, `USER_TRUST_CHANGED`, `USER_STATUS_CHANGED`, and
`USER_PII_PURGED`. Role changes require `ADMIN`; trust and status changes require `MODERATOR`/`ADMIN`.
`loadActor` rejects non-active users, so `SUSPENDED`/`CLOSED` users cannot act. Trust never grants
authorization. PII purge is owner-or-ADMIN, replaces auth identity with a `purged:<id>` tombstone, clears
email/phone/displayName/preferredLocale/lastActiveAt and roles, sets `CLOSED`, and leaves audit untouched.
`publicUserView` returns only `_id`. Evidence: `users.integration.test.ts`.

### Task 7 - Retention and purge

**Pass.** `purgeExpiredAssets` selects only `DELETED_PENDING_PURGE` assets with `retentionUntil <= now`, no
`legalHold`, and no prior `purgedAt`. It calls the provenance `purgeAsset`, which now refuses before
retention (`409 RETENTION_NOT_ELAPSED`), skips already-purged assets, deletes bytes, marks metadata, and
audits `ASSET_PURGED`. The scheduler never touches audit events or snapshots. No default retention duration
was invented. Evidence: `retention.integration.test.ts`.

### Task 8 - Abuse limits

**Pass.** Correction quotas are 10/day/user and 30/day/IP with the same `429 RATE_LIMITED` shape. The
plan-06 upload quota (5/day/user) now returns that same envelope (`path`, `cap`, `actual`,
`retryAfterSeconds`, nested `error`), while the 20 MiB byte cap remains `422 CAP_EXCEEDED` and content-hash
dedup is unchanged. Flood detection produces a moderator flag and does not auto-penalize. `trustLevel` is
never consulted by any limit. Evidence: `corrections.integration.test.ts`,
`tests/provenance/capture.integration.test.ts` (upload quota).

### Task 9 - Tests and report

**Pass.** The governance suite covers I09, I10, S12, S13, S17, audit redaction, approval-vs-application,
idempotent apply, stale target, quota, flood, PII purge, and legal-hold-aware retention. Evidence:
`test-governance.log`, `test-mongo.log`.

## 3. Decisions

1. **Audit append-only is enforced in code and by role.** MongoDB cannot make a collection insert-only with
   a validator, so the application's `ansooApp` role grants only `find` and `insert` on `audit_events`.
2. **One audit action covers review assignment and decision.** Both are review lifecycle changes; the
   summary distinguishes them with `status`, `assignedTo`, `reviewedBy`, and `decision`.
3. **Failed applications are retryable, successful ones are not.** A `FAILED` ledger row records the
   attempt and increments the correction version, but a later application with a new key may replace it.
   The same idempotency key always replays the recorded result.
4. **Correction application is one transaction.** Target write, correction ledger, and audit append share a
   session; failure injection rolls all three back.
5. **PII purge is a tombstone.** The user row remains for referential integrity with `CLOSED` status and a
   synthetic `authSubject`; audit rows never need mutation.
6. **No retention default.** The scheduler implements the legal-hold-aware mechanism only; plan 11 owns
   the retention ADR and restore-test obligation.

## 4. Measurements

| Measurement | Result |
| --- | --- |
| Governance test run | 7 passed (27 steps), 0 failed |
| Full unit/invariant/integration run | 122 passed (134 steps), 0 failed, 10 ignored |
| Correction quotas | 10/day/user, 30/day/IP |
| Correction evidence cap | 10 references |
| Flood window | 2+ distinct submitters on one target in 60 minutes |
| Upload quota (plan 06) | 5/day/user, 20 MiB |
| Audit summary | flat primitives only, per-action allowlist |

Latency and `explain()` measurements were not required by this plan; the correction indexes were added in
plan 03 and the unique sparse application index is exercised by the idempotency tests.

## 5. Security negative tests

- Unknown audit actions, unregistered targets, nested/array summaries, forbidden keys, control characters,
  emails, bearer tokens, JWTs, private keys, AWS keys, and Mongo credentials are rejected.
- A production audit role spec cannot update or remove audit events.
- Correction targets, field keys, operations, and value shapes outside the allowlist return `422`.
- Non-reviewers cannot decide; a submitter cannot approve their own correction.
- Approval leaves the target content and `version` unchanged.
- A stale target version returns `409 VERSION_CONFLICT` and records `FAILED`.
- A crash after the target write rolls back; a later apply repairs it.
- Repeated application with the same key replays; a different key is `409 ALREADY_APPLIED`.
- Correction quota exhaustion returns `429` with `path`, `cap`, `actual`, and `retryAfterSeconds`.
- Suspended/closed users cannot act; trust never bypasses roles or limits.
- Public user projections expose only `_id`; PII purge leaves audit append-only.
- Legal-hold assets are never purged; pre-retention purges return `409 RETENTION_NOT_ELAPSED`.

## 6. Blocked/open items

- **Asset retention duration** remains an open decision. This plan implements only the legal-hold-aware
  mechanism and requires an ADR before choosing a default.
- **Backup restore test** (PITR + object versioning) is a plan-11 launch obligation; no backup system is
  deployed in this environment.
- **HTTP triads** for these services are plan 08. The services accept a server-controlled actor and are not
  yet exposed through Lesan actions.
- **Live-network SSRF verification** remains plan 11, unchanged from plan 06.

## 7. Files changed

Production:

- `utils/governance/common.ts`, `audit.ts`, `auditPrivileges.ts`, `auditCoverage.ts`,
  `correctionPolicy.ts`, `correction.ts`, `user.ts`, `retention.ts`, `mod.ts`
- `utils/mod.ts` (exports `governance` namespace)
- `utils/provenance/asset.ts` (retention-aware `purgeAsset`)
- `utils/identity/registry.ts` (`resolve` options for archived/merge handling)
- `models/correction.ts` (`submissionIpHash`), `models/asset.ts` (`purgedAt`)
- `models/indexes.ts` (unique sparse `application.idempotencyKey` index and verification)

Tests and evidence:

- `tests/governance/audit.test.ts`, `audit-coverage.test.ts`, `corrections.integration.test.ts`,
  `users.integration.test.ts`, `retention.integration.test.ts`
- `tests/provenance/capture.integration.test.ts` (upload quota envelope)
- `docs/reports/evidence/07-governance-audit-corrections-and-users/`

Documentation:

- `docs/plans/07-governance-audit-corrections-and-users.md` (status)
- `docs/summary.md` (status)
- `docs/reports/README.md` (index)

No generated declarations, frontend files, or archive files were changed.

## 8. Verification

| Command | Result | Evidence |
| --- | --- | --- |
| `deno task fmt:check` | Pass, 107 files checked | `fmt-check.log` |
| `deno task lint` | Pass, 106 files checked | `lint.log` |
| `deno task check` | Pass | `check.log` |
| Governance tests (Mongo) | 7 passed (27 steps), 0 failed | `test-governance.log` |
| `deno task test` (Mongo) | 122 passed (134 steps), 0 failed, 10 ignored | `test-mongo.log` |
