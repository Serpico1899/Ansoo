# Agent Prompt - Execute Plan 11 (Verification, Hardening, and Launch)

Read `README.md` here, then `../plans/11-verification-hardening-and-launch.md`, spec Sections 12, 16, 20-24,
all prior reports, and the open-decision register.

## Mission

Prove the system against S01-S30, close I01-I15, complete stage gates A-F, measure performance, harden
security/operations, and produce an evidence-based launch recommendation. Do not claim success without
recorded evidence.

## Sequence

1. **Scenario matrix:** run S01-S30; record command, environment, observed/expected, pass/fail, evidence
   path. Failures stay failures.
2. **Invariants:** verify I01-I15 named tests; mutation-check critical ones; I04 full matrix; I09 DB layer.
3. **Concurrency/failure:** S13, S17, S27; cap-boundary appends; merge CAS/outbox; retraction during
   rebuild/read; concurrent correction apply.
4. **Performance/growth:** production-like dataset; record hardware, OS, Deno, Lesan, MongoDB, doc count,
   payload, query type; p50/p95/p99; retraction p95; BSON; `explain`; minutes/edge.
5. **Security/privacy:** auth, projection, SSRF, uploads, audit, corrections, rate limits, secrets, DB
   privileges, backups/restore, retention/legal hold.
6. **Stage gates:** A Discovery, B Models, C Indexes, D Actions, E Projection/Auth, F Scenarios; link every
   claim to evidence.
7. **Open decisions:** answer each Section 22 question by ADR or record blocked with owner/consequence.
8. **Launch gate:** legal counsel for first sensitive publication; methodology/funding/symmetric standards;
   named researcher/reviewer; production checklist; signed go/no-go.
9. **Report:** write `../reports/11-verification-hardening-and-launch.md`; propose spec edits where reality
   differs.

## Do Not

- Do not add features or collections to make a scenario pass.
- Do not hide failures or mark a scenario pass from intent.
- Do not launch write-heavy research while policy questions are unanswered.
- Do not default an open decision.
- Do not claim the ERD production-final before gates A-F are reported.

## Evidence Required

- S01-S30 table with evidence paths.
- I01-I15 closure table.
- Concurrency/failure-injection logs.
- Performance/BSON tables with environment metadata.
- Security negative-test matrix and residual-risk register.
- Stage-gate report.
- Open-decision register.
- Final signed recommendation.

## Stop Conditions

Stop if a scenario reveals a domain/invariant failure, if legal review is unavailable, if a backup restore
fails, or if any gate is unproven.
