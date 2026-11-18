# Reports and Evidence

Every completed plan writes one report here, named after the plan:

```
NN-<plan-name>.md
```

Raw logs, `explain()` output, benchmark data, screenshots, and HTTP transcripts go under
`evidence/NN-<plan-name>/`. Do not put secrets, tokens, private personal data, or restricted source content
in either location.

## Report Structure

1. **Environment** - Deno, Lesan, MongoDB, OS, hardware, database name, commands used.
2. **Results by task** - pass/fail/blocked, observed behavior, expected behavior, evidence path.
3. **Decisions** - what was decided, by whom, and where the ADR is.
4. **Measurements** - latency, documents examined, index used, BSON size, payload size.
5. **Security negative tests** - what was attempted and the result.
6. **Blocked/open items** - exact question, options, owner, consequence.
7. **Files changed** - production files, docs, tests, generated declarations, cleanup status.
8. **Verification** - exact command output, or an explicit statement of what could not run and why.

A report must not claim a test passed, a target was met, or a decision was final without evidence.

## Index

| Report | Plan | Status |
|---|---|---|
| `01-architecture-spike.md` | 01 (historical) | Complete with constraints; domain assumptions superseded by v3.1 |
| `02-foundation-and-invariants.md` | 02 | Complete with one documented process deviation |
| `03-models-contracts-and-indexes.md` | 03 | Complete |
| `04-identity-normalization-and-resolution.md` | 04 | Complete |
| `05-graph-claims-and-publication-gates.md` | 05 | Complete |
| `06-provenance-assets-and-capture.md` | 06 | Complete |
| `07-governance-audit-corrections-and-users.md` | 07 | Complete |
| `08-auth-projections-and-api-contract.md` | 08 | Not started |
| `09-public-profile-read-model-and-vertical-slice.md` | 09 | Not started |
| `10-data-acquisition-and-research-operations.md` | 10 | Not started |
| `11-verification-hardening-and-launch.md` | 11 | Not started |
