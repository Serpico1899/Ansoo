# Architecture Decision Records

An ADR records a decision that changes or clarifies the backend's domain model, data boundaries,
security posture, or operational architecture. The canonical domain contract is CT-DOMAIN-SPEC v3.1;
an ADR may extend it but may not silently contradict it.

## When an ADR Is Required

- Adding, removing, or renaming a canonical collection.
- Adding or changing a Lesan relation boundary.
- Adding a predicate, claim type, enum value, or status transition.
- Changing an audit action, redaction rule, retention rule, or projection boundary.
- Changing concurrency, idempotency, merge, or deletion semantics.
- Resolving one of the open decisions in spec Section 22.
- Introducing a new external data source, license obligation, or derived dataset.

## File Naming

```
NNNN-short-kebab-title.md
```

Numbers are sequential and never reused. Superseded ADRs stay in place with `Status: Superseded by ADR-NNNN`.

## Required Format

```markdown
# ADR-NNNN: Title

| Field | Value |
|---|---|
| Status | Proposed / Accepted / Superseded / Rejected |
| Date | YYYY-MM-DD |
| Owners | Role or person |
| Supersedes | ADR-NNNN or none |
| Superseded by | ADR-NNNN or none |

## Context

What problem or ambiguity forced a decision? What does the canonical spec already say?

## Decision

The decision, stated in one or two sentences, followed by the concrete rules.

## Alternatives Considered

Real alternatives, with what each trades off.

## Consequences

Positive, negative, migration cost, tests required, and follow-up work.

## Evidence

Links to tests, benchmarks, reports, or external references.
```

## Index

| ADR | Title | Status | Date |
|---|---|---|---|
| 0001 | v3.1 is the single canonical domain baseline | Accepted | 2026-11-16 |
