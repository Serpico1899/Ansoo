# Plan 07 - Governance, Audit, Corrections, and Users (v3.1)

**Status:** Not started
**Depends on:** 03, 05
**Feeds:** 08 (roles/auth), 09 (correction notice)
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`
**Roadmap:** `00-roadmap.md`

## Purpose

Make the platform accountable: append-only audit, allowlisted correction proposals with safe idempotent
application, user roles and PII boundaries, retention/purge behavior, and abuse limits. This plan makes I09
and I10 executable and provides the role data that plan 08 enforces.

## Non-Goals

- No generic database patcher or free `$set`.
- No correction auto-application on approval.
- No PII in audit, research notes, or public projections.
- No production identity provider integration; plan 08 covers JWT mechanics.

## Pre-Flight

- [ ] Read spec Sections 9, 12, 16, 24.
- [ ] Confirm models/contracts from plan 03 and status/audit actions from plan 05.
- [ ] Confirm MongoDB replica-set/transaction behavior from plan 02.
- [ ] Confirm the installed Lesan APIs for append-only repositories and atomic updates.

## Tasks

### 1. Audit repository (append-only, I09)

- [ ] Implement `appendAuditEvent` and list/query only. There is no update or delete API.
- [ ] Reject update/delete at the repository/service layer with a hard error.
- [ ] Add DB-level privileges/tests that deny update/delete on `audit_events` in production.
- [ ] Use the closed `AuditAction` enum; unknown actions are rejected.
- [ ] Validate `target` through the registry and `actor` from the authenticated principal or SYSTEM/SERVICE.
- [ ] Record `requestId`/`correlationId`, optional `idempotencyKey`, version before/after, changedPaths.
- [ ] Summaries are flat and allowlisted per action; reject nested values and arrays.
- [ ] Never record email, phone, authSubject, passwordHash, registeredAddress, research note bodies, tokens,
  private asset keys, or full documents.
- [ ] Test redaction with adversarial payloads, including nested objects and secrets in strings.
- [ ] Ensure account deletion never requires mutating Audit; Audit stores only `actor.id`.

**Exit:** I09 passes; no application path can update or delete an AuditEvent.

### 2. Audit coverage

- [ ] Emit AuditEvents for identity create/update/archive/merge/unmerge, identifier changes, brand mapping,
  relationship create/close, claim create, review/assessment/publication/gate changes, public wording,
  retraction, waiver, evidence changes, source/snapshot/redaction events, solicitations, responses, asset
  lifecycle, correction lifecycle, role/trust/status changes, and PII purge.
- [ ] Use one correlation id for a multi-step workflow.
- [ ] Record before/after summaries only from the action allowlist, never raw documents.
- [ ] Add a test that every mutation action in the registry has at least one audit test.

**Exit:** every material state change is traceable; no silent mutation path exists.

### 3. Correction submission

- [ ] `submissionKind`: `CORRECT_EXISTING`, `ADD_MISSING`, `RETRACT`, `REPORT_ISSUE`.
- [ ] `target` is required except for a valid `ADD_MISSING`; validate target type against
  `CorrectionTargetType`.
- [ ] `proposedChange` supports only `SET`, `UNSET`, `ADD_RELATIONSHIP`, `END_RELATIONSHIP`.
- [ ] `fieldKey` is allowlisted per `targetType`; unknown field/operation -> `422`.
- [ ] `proposedValue` is validated by the schema for `(targetType, fieldKey)`; never free-form JSON.
- [ ] `proposedEntity` is validated by the registry and endpoint rules for relation operations.
- [ ] `reason` required; `evidenceReferences` capped at 10 and validated (snapshot/asset/url/note).
- [ ] `submittedBy` from auth; `submittedAt` server time.
- [ ] `idempotencyKey` required and unique per submitter; a duplicate returns the existing submission, not a
  second document.
- [ ] Enforce quota: 10/day/user and 30/day/IP; flag coordinated dispute floods (multiple accounts, one
  target, short window) to MODERATOR.
- [ ] Audit `CORRECTION_SUBMITTED`.

**Exit:** S12 passes; arbitrary `$set`, operators, field paths, and unknown targets are rejected.

### 4. Correction review

- [ ] Statuses: `PENDING`, `IN_REVIEW`, `NEEDS_INFORMATION`, `APPROVED`, `REJECTED`, `WITHDRAWN`.
- [ ] `review` records assignee, reviewer, date, decision reason.
- [ ] Only authorized reviewers may assign/decide; the submitter cannot approve their own correction.
- [ ] Approval is separate from application; approval must not mutate the target.
- [ ] `WITHDRAWN` is submitter-only and only before a terminal decision.
- [ ] Audit `CORRECTION_REVIEWED`.
- [ ] Test that approval leaves the target's `version` and content unchanged.

**Exit:** `APPROVED != APPLIED` is proven by test.

### 5. Correction application (I10)

- [ ] Application requires status `APPROVED`, a dedicated domain action, authorization, expected target
  version, and an application `idempotencyKey`.
- [ ] Re-validate `fieldKey`, operation, and value against the allowlist at application time; approval does
  not bypass validation.
- [ ] Use CAS on the target version; stale version -> `409 VERSION_CONFLICT`.
- [ ] Application ledger: `APPLIED`, `FAILED`, `NOT_APPLICABLE`; record before/after versions and failure
  reason.
- [ ] Enforce a unique sparse index on `application.idempotencyKey`; repeated apply is a safe no-op or
  controlled conflict, never a double write.
- [ ] The target update, correction application status, and audit write must be transaction/outbox safe.
  Failure injection must leave no permanent inconsistency (S17).
- [ ] Never apply a raw patch; never let `proposedValue` become `$set`.
- [ ] Audit `CORRECTION_APPLIED` with correlation id and target versions.
- [ ] Emit a `PublicCorrectionNotice` payload for plan 09 when previously published wording changes or is
  retracted.

**Exit:** I10, S13, S17 pass; concurrent double-apply cannot corrupt the target.

### 6. Users, roles, and PII

- [ ] `users` fields exactly as spec Section 9.2: authProvider, authSubject, private email/phone,
  displayName, preferredLocale, roles, trustLevel, accountStatus, lastActiveAt.
- [ ] Roles: `CONTRIBUTOR`, `RESEARCHER`, `RESEARCH_REVIEWER`, `LEGAL_REVIEWER`, `MODERATOR`, `ADMIN`.
- [ ] `trustLevel` is not an authorization role and not a rate limiter.
- [ ] Account deletion purges PII and preserves `actor.id` in audit; audit never needs mutation.
- [ ] `USER_ROLES_CHANGED`, `USER_TRUST_CHANGED`, `USER_STATUS_CHANGED`, `USER_PII_PURGED` are audited.
- [ ] Never expose email, phone, authSubject, roles, or private profile fields publicly.
- [ ] Add tests for role changes, suspended/closed behavior, and PII absence from public/audit payloads.

**Exit:** PII exists only in `users`; authorization data is server-derived.

### 7. Retention and purge

- [ ] Assets in `DELETED_PENDING_PURGE` are purged after `retentionUntil` unless `legalHold`.
- [ ] Purge removes bytes and marks metadata; never silently removes audit or snapshots.
- [ ] Record `ASSET_PURGED` with safe metadata.
- [ ] Backups use PITR + object versioning; document the restore-test obligation for plan 11.
- [ ] Keep the exact asset retention policy as an open decision until an ADR resolves it.

**Exit:** purge is legal-hold aware and audited; no retention default is invented.

### 8. Abuse limits

- [ ] Correction quota 10/day/user and 30/day/IP.
- [ ] Upload quota 5/day/user and 20 MiB.
- [ ] Content-hash dedup for uploads.
- [ ] Coordinated dispute flood detection produces a MODERATOR flag; it does not auto-penalize.
- [ ] Rate-limit responses use a consistent error shape and do not leak whether another user exists.
- [ ] `trustLevel` never bypasses a limit.

**Exit:** limit tests prove enforcement and safe error envelopes.

### 9. Tests and report

- [ ] Tests: I09, I10, S12, S13, S17, plus audit redaction, approval-vs-application, idempotent apply, stale
  version, quota, and PII purge.
- [ ] Failure-injection test: crash between target write and correction/audit write, then repair.
- [ ] Write `reports/07-governance-audit-corrections-and-users.md`.

## Deliverables

1. Append-only audit repository with per-action allowlists.
2. Correction submission/review/application with idempotency and CAS.
3. Public correction notice payload.
4. User roles, trust, status, and PII purge behavior.
5. Retention hooks and abuse limits.
6. `reports/07-governance-audit-corrections-and-users.md`.

## Acceptance Criteria

1. I09 passes at service and DB-privilege layers.
2. I10 passes; no raw patch path exists.
3. Approval does not mutate the target; application is the only path.
4. Concurrent/stale/double application is safe (S13, S17).
5. Audit contains no PII, secrets, nested summaries, or full documents.
6. PII lives only in `users`; public projections cannot reach it.

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
| Correction becomes a database patcher | Field/operation allowlist + schema validation at submit and apply |
| Double application | Unique idempotency ledger + CAS + transaction/outbox |
| Audit drift | Closed action enum + coverage test per mutation action |
| PII leaks through audit | Flat allowlisted summaries + adversarial redaction tests |
| Retention policy guessed | Keep open; only implement the legal-hold-aware mechanism |
