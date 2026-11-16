# Agent Prompt - Execute Plan 04 (Identity, Normalization, and Resolution)

Read `README.md` here, then `../plans/04-identity-normalization-and-resolution.md`, spec Sections 4-5 and
13, plan 03's models, and ADR-0001.

## Mission

Make identity exact and honest: implement the Persian normalization algorithm verbatim, normalize
identifiers per scheme, close the reference registry, implement merge/redirect, and return
`FOUND`/`NOT_FOUND`/`AMBIGUOUS`/`DISPUTED`/`UNVERIFIED` without guessing.

## Sequence

1. **Normalization:** implement `normalizedName` and `matchKey` exactly as Section 13.1. Run all six
   mandatory vectors and property tests. Never alter the algorithm without an ADR.
2. **Identifiers:** strings only; per-scheme normalization; GTIN length/check digit and `matchValue`
   padding for lookup only; preserve leading zeros; no cross-scheme comparison; no unique index.
3. **URL canonicalization:** host/port/fragment/tracking/IDN rules; dedup is suggestive only.
4. **Registry/resolver:** closed `EntityType`, per-field allowlists, `{type,id}` only, existence/type/lifecycle
   checks, merge-following max 5 with cycle detection and admin flag.
5. **Merge/redirect:** tombstone + redirect; never rewrite history; block contradictory official identifiers;
   audited CAS; unmerge path.
6. **Resolution:** exact scheme+value+scope; `NOT_FOUND` is valid; `AMBIGUOUS` returns candidates; no
   barcode/brand inference.
7. **Brand mapping:** `UNREVIEWED` default; candidate is a proposal; only `VERIFIED` populates the relation;
   audited action.
8. **Search:** exact `matchKey` + escaped `normalizedName` prefix; no fuzzy promise; tombstones handled.
9. **Tests/report:** S01, S02, S20, S25, I13, I15 and negative cases; write
   `../reports/04-identity-normalization-and-resolution.md`.

## Do Not

- Do not "improve" the normalization vectors.
- Do not merge identities automatically.
- Do not accept a collection/model/path/operator from a client.
- Do not infer country, nationality, ownership, or legal status from a barcode or GS1 prefix.
- Do not compare identifiers across schemes.

## Evidence Required

- Six normalization vectors, exactly.
- Property-test output.
- Leading-zero GTIN round-trip and invalid check-digit rejection.
- Merge chain/cycle test output and historical-reference proof.
- Resolution outcome tests, including no arbitrary match.
- Verification logs.

## Stop Conditions

Stop if an identifier scheme's rules are unknown, if a merge decision requires product/legal policy, or if
the installed Lesan/Mongo behavior cannot enforce the registry safely.
