# Agent Prompt - Execute Plan 02 (Foundation and Invariants)

Read `README.md` in this directory first. Then read `../plans/02-foundation-and-invariants.md`,
`../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` (Sections 1-4, 15-16, 22-24), `../adr/0001-v3.1-single-canonical-spec.md`,
and `../../AGENTS.md`.

## Mission

Align the scaffold with v3.1 before production models are written. Establish one authority, one set of
shared enums/caps, the invariant test harness, the replica-set dev topology, and the documentation regime.

## Sequence

1. **Pre-flight delta.** List existing files, installed Lesan version, and every stale v1/v2 assumption:
   categories, third relation, old predicates/claim types, `visibilityScope`, `latestSnapshotId`, snapshot
   version, free-form attributes. Also check `AGENTS.md`, `back/AGENTS.md`, and root docs for old-ERD
   authority; plan their v3.1 correction.
2. **Correct the scaffold.** Remove/archive `models/category.ts` and `src/category/`; remove category
   references from Product, actions, and docs; decide the fate of `back/spike/`.
3. **Shared vocabulary.** One tested module for the closed `EntityType` registry, endpoint allowlists, five
   predicates, three claim types, status enums, audit actions, caps, and taxonomy loading.
4. **Invariant harness.** Create named tests I01-I15, each initially failing for the right reason, plus a
   CI check that no invariant test is missing.
5. **Infrastructure.** Single-node replica set, `.env.example`, fail-fast config, UTC date checks,
   reproducible type generation.
6. **Verify and report.** Run all commands; write `../reports/02-foundation-and-invariants.md`.

## Do Not

- Do not implement domain CRUD, publication workflow, profile assembly, or acquisition.
- Do not reintroduce Category or a third Lesan relation.
- Do not invent an answer to a Section 22 open decision.
- Do not leave a second summary or a second source of authority.

## Evidence Required

- Delta report before/after.
- Grep proof that forbidden terms are absent from production paths.
- Invariant test inventory and map.
- Replica-set start command and config fail-fast output.
- Verification logs.

## Stop Conditions

Stop if a v3.1 invariant cannot be represented without a model change, if the spike code cannot be isolated
safely, or if a stale assumption cannot be removed without a product decision.
