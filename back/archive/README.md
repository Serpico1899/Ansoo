# Archived Engineering Evidence

This directory holds historical code that is **never imported by production paths**.

- `01-architecture-spike/` - the disposable spike harness and its tests, executed against the superseded
  v1/v2 draft. Its Lesan/MongoDB mechanics, security negatives, index method, and BSON measurements remain
  evidence. Its category, third-relation, extra predicate/claim-type, `visibilityScope`,
  `latestSnapshotId`, and snapshot-version decisions are void under v3.1. See
  `../docs/adr/0001-v3.1-single-canonical-spec.md` and `../docs/reports/01-architecture-spike.md`.

Do not import these files from `mod.ts`, `models/`, `src/`, `utils/`, `scripts/`, or `tests/`.
