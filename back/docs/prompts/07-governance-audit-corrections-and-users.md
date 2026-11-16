# Agent Prompt - Execute Plan 07 (Governance, Audit, Corrections, and Users)

Read `README.md` here, then `../plans/07-governance-audit-corrections-and-users.md`, spec Sections 9, 12,
16, and plans 03/05.

## Mission

Make the platform accountable: append-only audit, allowlisted correction proposals, safe idempotent
application, user roles/PII boundaries, retention hooks, and abuse limits.

## Sequence

1. **Audit:** append/list only; no update/delete API; DB privileges deny mutation; closed action enum;
   registry-validated target; flat allowlisted summaries; request/correlation ids; redaction tests.
2. **Coverage:** emit audit for every material mutation and prove each mutation action has audit coverage.
3. **Correction submission:** validate target/kind/fieldKey/operation/proposedValue/evidence; per-submitter
   unique idempotency key; quotas; audit.
4. **Correction review:** statuses/assignee/decision; approval never mutates the target; submitter cannot
   self-approve; audit.
5. **Application:** dedicated action; APPROVED + expectedVersion + idempotency key; revalidate allowlist;
   CAS; ledger; transaction/outbox; no raw `$set`; public correction notice; audit.
6. **Users:** exact fields; six roles; trust != auth; PII purge on deletion; no public PII; status changes
   audited.
7. **Retention/abuse:** legal-hold-aware purge; correction/upload quotas; content-hash dedup; coordinated
   flood flag; consistent 429.
8. **Tests/report:** I09, I10, S12, S13, S17; approval-vs-application; crash window; write
   `../reports/07-governance-audit-corrections-and-users.md`.

## Do Not

- Do not add a generic database patcher.
- Do not apply `proposedValue` as `$set`.
- Do not let approval change canonical data.
- Do not put PII, secrets, nested values, or full documents in audit.
- Do not invent an asset retention default.

## Evidence Required

- Audit append-only proof at service and DB layers.
- Redaction and flat-summary negative tests.
- Correction allowlist and double-apply tests.
- Failure-injection repair evidence.
- PII purge and role/trust tests.
- Verification logs.

## Stop Conditions

Stop if transactions/outbox cannot make application safe, if an allowlist policy is undefined, or if a
retention/legal policy decision is required.
