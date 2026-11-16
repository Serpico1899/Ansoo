# Plan 02 - Foundation and Invariants (v3.1)

**Status:** Complete with one documented process deviation (2026-11-16)
**Depends on:** none
**Blocks:** plans 03-11
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`
**Roadmap:** `00-roadmap.md`

## Purpose

Align the repository with v3.1 before any production model or action is written. Establish the shared
domain vocabulary, the invariant test harness, the local database topology, and the documentation/ADR
regime that every later plan depends on. This is a short foundation plan, not a feature plan.

## Non-Goals

- No domain CRUD actions beyond what is needed to make invariant tests executable.
- No public profile assembly, publication workflow, or data acquisition.
- No final indexes or benchmark data.
- No production deployment.

## Pre-Flight (Mandatory)

- [x] Read the spec in full, especially Sections 1-4, 15, 16, 22-24.
- [x] Read `../../AGENTS.md`, `../../../AGENTS.md`, `deno.json`, `deno.lock`, `mod.ts`.
- [x] Read every existing file under `models/`, `src/`, `utils/`, `tests/`, and `spike/`.
- [x] Confirm the installed Lesan version from `deno.lock`; do not rely on memory or old examples.
- [x] Produce a delta report: current scaffold vs v3.1, including stale categories, relation assumptions,
  predicate/claim enums, and spike artifacts.

## Tasks

### 1. Establish the canonical baseline and decision log

- [x] Confirm `CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` is referenced as the only authority in
  `docs/README.md`, `docs/summary.md`, `docs/plans/00-roadmap.md`, and plan/prompt headers.
- [x] Update `AGENTS.md` and `back/AGENTS.md` references from the old ERD to v3.1, or add an explicit
  precedence note pointing at ADR-0001. Do not leave an agent instruction that makes the old ERD authoritative.
- [x] Record ADR-0001 as accepted (already written) and add it to `docs/adr/README.md`.
- [x] Add a clearly marked historical banner to `plans/01-architecture-spike.md`,
  `prompts/01-architecture-spike.md`, and `reports/01-architecture-spike.md` where their domain decisions
  conflict with v3.1.
- [x] List every surviving spike finding that remains valid: naming, relation mechanics, projection
  allowlists, audit append-only, identifier behavior, index method, BSON methodology.
- [x] List every void spike decision: `categories`, `Product.category`, `SUBSIDIARY_OF`, extra predicates,
  extra claim types, `visibilityScope`, source `latestSnapshotId`, snapshot `version`.

**Exit:** one accepted baseline, one decision log, and no document claiming two authorities.

### 2. Correct the scaffold to the v3.1 shape

- [x] Remove or archive `models/category.ts` and `src/category/`.
- [x] Remove category references from `models/product.ts`, `src/product/updateRelations/`, `src/mod.ts`, and
  any prompt/summary text that still treats Category as a collection.
- [x] Ensure the planned action folders match v3.1. Delete or rename folders that imply forbidden actions
  (for example generic category CRUD), and add missing v3.1 actions through plans 03-09 rather than ad hoc.
- [x] Replace free-form `attributes: Record<string, unknown>` assumptions with the typed attribute registry.
- [x] Remove `Source.latestSnapshotId`, snapshot `version`, and `PublicationState.visibilityScope` from all
  scaffold comments and generated-plan text.
- [x] Decide whether `back/spike/` stays as archived evidence or is deleted. If archived, move it under a
  path that cannot be imported by production code; if deleted, keep the report and evidence logs.

**Exit:** no production scaffold path contradicts v3.1; stale category/third-relation code is gone.

### 3. Shared domain vocabulary and constants

Create one tested module (for example `utils/domain/constants.ts`) with:

- [x] Closed `EntityType` registry and the per-field endpoint allowlists:
  `RelationshipEndpointType`, `ClaimAboutType`, `CorrectionTargetType`, `AuditTargetType`.
- [x] Exactly five predicates and their subject/object/context matrix.
- [x] Exactly three claim types and their structured-value discriminants.
- [x] Status enums: `recordLifecycle`, `ReviewWorkflow`, `EvidenceAssessment`, `PublicationState`,
  `Sensitivity`, `LimitationCode`, `AcquisitionTier`.
- [x] Every audit action from spec Section 9.3; deny unknown actions by default.
- [x] Every cap from spec Section 4.5, including character limits and `captureMetadata` depth.
- [x] Allowed identifier schemes, alias schemes, source types, asset visibility/processing values, and
  response/solicitation enums.
- [x] `taxonomy.v1.json` location and loading contract; no Category collection.

**Exit:** enums are declared once, imported everywhere, and covered by a compile-time exhaustiveness test.

### 4. Invariant test harness

- [x] Create `tests/invariants/` with one test file per invariant, or one file with clearly named tests:
  `I01` ... `I15`.
- [ ] Each test must fail for the right reason before the enforcing code exists, then pass when it lands.
  Deviation: the red phase was not separately captured for I01/I02/I03/I12; the harness landed with
  `utils/domain/constants.ts` and the active tests pass. See report 02.
- [x] Map every invariant to the plan that will implement it and the scenario that verifies it (S01-S30).
- [x] Add a CI/test task that fails if any invariant is missing a test.
- [x] Keep tests deterministic; no reliance on wall-clock ordering or shared database state.

| Invariant | Implemented by |
|---|---|
| I01, I02, I03, I12 | 03, 05, 08, 09 |
| I04 | 08, 09 |
| I05, I06, I07 | 05, 07 |
| I08 | 06 |
| I09, I10 | 07 |
| I11 | 09 |
| I13 | 04 |
| I14 | 03 |
| I15 | 04 |

**Exit:** the harness exists and the plan-to-invariant map is recorded.

### 5. Local infrastructure and configuration

- [x] Document and script a single-node MongoDB replica set for development so transactions behave like
  production (`rs.initiate()`), including the exact `mongod` command and connection string.
- [x] Extend `.env.example` with `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, asset provider settings, object
  storage root/bucket, and any proxy policy needed for acquisition. No real secrets.
- [x] Make startup fail loudly on missing required configuration; never silently use a default secret.
- [x] Confirm UTC `Date` round-trips and that `null` dates remain `null`.
- [x] Confirm type generation is wired and generated files are reproducible from source.

**Exit:** a developer can start the correct database topology and the app fails fast on bad config.

### 6. Verification and reporting baseline

- [x] Run `deno task fmt:check`, `deno task lint`, `deno task check`, `deno task test`.
- [x] Record the exact commands and outputs in `reports/02-foundation-and-invariants.md`.
- [x] Record remaining blockers and any new ADR required.
- [x] Update `docs/README.md` status and the roadmap if reality changed.

## Deliverables

1. Scaffold corrected to v3.1; no category collection or third relation.
2. Shared domain constants module and taxonomy file contract.
3. Invariant test harness with a plan-to-invariant map.
4. Replica-set development setup and expanded `.env.example`.
5. `reports/02-foundation-and-invariants.md`.
6. Any new ADR required by a discovered conflict.

## Acceptance Criteria

1. ADR-0001 is accepted and linked; no document claims the old ERD is authoritative.
2. Exactly 11 domain collections and exactly 2 relations are represented in plans and scaffold; the
   technical read model is the only derived collection.
3. A closed `EntityType` registry and the five-predicate/three-claim-type vocabulary exist in one place.
4. I01-I15 each have a named test entry, even if the test is initially red.
5. Local MongoDB runs as a single-node replica set and the app fails fast on missing config.
6. All verification commands pass, or failures are explicitly reported with reasons.

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
| Old domain assumptions survive in comments or plans | Search for `category`, `SUBSIDIARY_OF`, `visibilityScope`, `latestSnapshotId`, and `OTHER_` before closing the plan |
| Spike code is imported by production by accident | Archive outside production import paths or delete; keep the report |
| Constants drift from the spec | One module, exhaustive tests, and a spec-section reference per constant |
| Invariant tests are skipped as "later" | CI check for missing invariant names; each plan claims its invariants |
| Replica set is treated as optional | Document it as the only supported dev topology |

## Out of Scope

- Full models, validators, domain actions, public profile, and data acquisition.
- Production deployment, monitoring, and backups.
