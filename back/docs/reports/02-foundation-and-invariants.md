# Plan 02 - Foundation and Invariants (v3.1) - Report

**Status:** Complete with one documented process deviation (2026-11-16) **Plan:**
`docs/plans/02-foundation-and-invariants.md` **Canonical contract:**
`../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` (CT-DOMAIN-SPEC v3.1) **Evidence:**
`docs/reports/evidence/02-foundation-and-invariants/`

## 1. Environment

| Item              | Value                                                       |
| ----------------- | ----------------------------------------------------------- |
| OS                | Ubuntu 24.04.2 LTS (x86_64)                                 |
| Runtime           | Deno 2.4.5                                                  |
| Backend framework | Lesan 0.2.3 (`jsr:@hemedani/lesan@0.2.3`, `deno.lock`)      |
| Database          | MongoDB 8.0.13, single-node replica set `rs0` on port 27019 |
| Database name     | `ansoo`                                                     |
| Development URL   | `mongodb://127.0.0.1:27019/?replicaSet=rs0`                 |

The system `mongod` on port 27017 is not a replica set. Development uses the scripted instance on
27019 so transaction behavior matches production (spec Section 16.2). No credentials are stored in
this report or in the evidence logs.

Commands used:

```bash
deno task db:dev
deno task fmt
deno task fmt:check
deno task lint
deno task check
deno task test
deno task config:check
deno task types
```

## 2. Results by task

### Task 1 - Canonical baseline and decision log

**Pass.**

- `docs/README.md`, `docs/summary.md`, `docs/plans/00-roadmap.md`, and the plan/prompt headers name
  `CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` as the only domain authority.
- Root `AGENTS.md` and `back/AGENTS.md` now point to v3.1 and ADR-0001; the old ERD is explicitly
  historical.
- ADR-0001 remains accepted and indexed in `docs/adr/README.md`.
- Plans/prompts/report 01 carry historical banners.
- Surviving and void spike findings are recorded in section 3.

### Task 2 - Remove stale assumptions and dispose of the spike

**Pass.**

- `models/category.ts`, `src/category/`, and the `Product -> Category` scaffold assumption are
  removed.
- `models/product.ts` uses `categoryCode` plus the typed `ProductAttributeKey` set; there is no
  category relation.
- `models/source.ts` has no `latestSnapshotId`; `SourceSnapshot` has no mutable `version`;
  `PublicationState` has no `visibilityScope`.
- Action folders under `src/` now match v3.1 groups. Generic category CRUD is gone. Remaining
  folders are scaffolds for plans 03-08; no production action was implemented.
- Free-form `attributes: Record<string, unknown>` assumptions are replaced by the typed attribute
  registry in `utils/domain/constants.ts`.
- Spike code is archived under `back/archive/01-architecture-spike/`; nothing there is imported by a
  production path. `back/archive/README.md` records that status.
- Stale generated frontend declarations were removed; `front/src/types/declarations/` now contains
  only `.gitkeep`.
- `front/AGENTS.md` was corrected for `categoryCode`, the two approved relations, five predicates,
  three claim types, and the six roles.

Forbidden-term proof (`docs/reports/evidence/02-foundation-and-invariants/forbidden-terms.log`)
scanned `back/models`, `back/src`, `back/utils`, `back/scripts`, `back/mod.ts`, `back/declarations`,
`back/deno.json`, `back/taxonomy.v1.json`, front declarations, and all three `AGENTS.md` files for
`categories`, `SUBSIDIARY_OF`, `visibilityScope`, `latestSnapshotId`, `OTHER_REVIEWED`,
`Product.category`, `MANUFACTURING_LOCATION`, `CORPORATE_ACTIVITY`, `EXPORTS_TO_MARKET`, `OPERATES`,
`SUPPLIES`, `LICENSES`, and `FRANCHISES`: **no matches**. Matches in `back/archive/` are expected
and isolated from production imports.

### Task 3 - Shared vocabulary and contracts

**Pass.**

`utils/domain/constants.ts` is the single source for:

- Closed `EntityType` registry and endpoint allowlists.
- Five predicates and their subject/object/context matrix.
- Three claim types and their structured-value discriminants.
- All status enums: `recordLifecycle`, `ReviewWorkflow`, `EvidenceAssessment`, `PublicationState`,
  `Sensitivity`, `LimitationCode`, review/application statuses, role, trust, source, snapshot,
  asset, correction, and audit vocabularies.
- The complete Section 9.3 audit action list with deny-by-default lookup.
- Every Section 4.5 cap, including array caps, excerpt/response/note lengths, `captureMetadata`
  depth, and fetch/upload limits.
- Identifier schemes, alias schemes, source types, asset visibility/processing values.
- Typed `ProductAttributeKey` values.

`utils/domain/taxonomy.ts` loads `taxonomy.v1.json`; it rejects malformed nodes and exposes no
Category collection. `utils/domain/mod.ts` re-exports the domain surface.

Unit coverage: `tests/domain/constants.test.ts` and `tests/domain/taxonomy.test.ts`.

### Task 4 - Invariant test harness

**Pass, with one process deviation.**

`tests/invariants/inventory.ts` maps all fifteen invariants to enforcing plans and S-scenarios.
`tests/invariants/invariants.test.ts` registers each invariant with a named test;
`tests/invariants/inventory.test.ts` fails CI if an invariant is missing, duplicated, or unmapped.

Active in plan 02:

| Invariant                                                                 | Status | Evidence                                         |
| ------------------------------------------------------------------------- | ------ | ------------------------------------------------ |
| I01 - Product/Brand/Organization distinct                                 | Green  | Closed identity registry; no cross-type relation |
| I02 - `UNKNOWN` is not `FALSE`; `NOT_SUPPORTED` is not a negative boolean | Green  | Status vocabularies; no boolean collapse         |
| I03 - Review/assessment/publication/legal/campaign stay separate          | Green  | Independent status objects                       |
| I12 - No universal score/color/badge/verdict                              | Green  | No score fields in vocabulary or taxonomy        |

Registered but explicitly ignored until their enforcing action/read model lands:

| Invariant | Blocked by                                          |
| --------- | --------------------------------------------------- |
| I04       | Plan 08: role x internal-field projection matrix    |
| I05       | Plan 05: assessment action and evidence enforcement |
| I06       | Plan 05: publication state machine and gate         |
| I07       | Plan 05: four-eyes gate enforcement                 |
| I08       | Plan 06: snapshot capture and repository            |
| I09       | Plan 07: append-only audit repository               |
| I10       | Plan 07: allowlisted correction application         |
| I11       | Plan 09: public profile assembly                    |
| I13       | Plan 04: identifier normalization and resolution    |
| I14       | Plan 03: model validators                           |
| I15       | Plan 04: merge and redirect resolver                |

**Deviation:** the plan asks each test to fail for the right reason before enforcing code exists.
The red phase was not captured separately for I01/I02/I03/I12; the harness and
`utils/domain/constants.ts` landed together, and the active tests pass. The unchecked pre-flight
item in the plan and this report record that honestly. No invariant is claimed green without a
running test.

### Task 5 - Reproducible infrastructure

**Pass.**

- `scripts/mongo-dev.sh` starts one `mongod` with `--replSet rs0` on port 27019, initiates the set
  once, and waits for `PRIMARY`. `deno task db:dev` runs it.
- `.env.example` documents `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, asset provider settings,
  object-storage settings, and SSRF fetch limits. Old `MONGO_*` names were removed from `deno.json`.
- `utils/config.ts` fails fast on missing values, short/placeholder JWT secrets, invalid numeric
  bounds, and a non-replica-set MongoDB URL outside `test`. `scripts/check-config.ts`
  (`deno task config:check`) exposes the same validation without starting a server.
- `mod.ts` now loads config and exits with a clear "server not implemented" message. It never exits
  0 as if a server were running, and it never accepts a default secret.
- UTC `Date` round-trip and `null` preservation are unit-tested and verified against the live
  replica set.
- `scripts/generate-types.ts` regenerates `declarations/selectInp.ts` from `models/mod.ts`; output
  is reproducible and contains no category relation.

### Task 6 - Verification and documentation

**Pass.**

`deno task fmt`, `fmt:check`, `lint`, `check`, and `test` all exit 0. Exact output is in
`evidence/02-foundation-and-invariants/verification.log`. Status rows in `docs/README.md`,
`docs/plans/00-roadmap.md`, `docs/summary.md`, `docs/reports/README.md`, and plan 02 are updated.

## 3. Decisions

| Decision                                                      | Rationale                                                                                             | Record                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Archive the spike instead of deleting it                      | Preserves Lesan/MongoDB mechanics and historical evidence while removing every production import path | `archive/README.md`, this report                   |
| Keep only the v3.1 vocabulary                                 | Two authorities would recreate the v1/v2 conflict ADR-0001 resolved                                   | ADR-0001, `AGENTS.md`                              |
| No new ADR                                                    | No domain decision was made; Section 22 remains open and untouched                                    | This report                                        |
| Scope `deno test` to `tests/`                                 | Archived spike tests contain void v1/v2 assumptions and must not run                                  | `deno.json`                                        |
| Make `mod.ts` fail loudly                                     | A silent exit 0 would look like a working server before plans 03-08                                   | `mod.ts`                                           |
| Remove stale frontend declarations and fix front instructions | Stale generated category output would mislead frontend work even though plan 02 is backend-scoped     | `front/AGENTS.md`, `front/src/types/declarations/` |

Surviving spike findings: Lesan 0.2.3 collection naming, relation embedding/snapshot mechanics,
reverse preview behavior, and MongoDB replica-set requirements.

Void spike decisions: the `categories` collection, `Product.category`, `SUBSIDIARY_OF`, extra
predicates, extra claim types, `visibilityScope`, `latestSnapshotId`, snapshot `version`, and
free-form Product attributes.

## 4. Measurements

| Measure                      | Result                                                    |
| ---------------------------- | --------------------------------------------------------- |
| Models                       | 11 canonical model files plus `models/mod.ts`             |
| Action groups                | 12 scaffold groups under `src/` (11 domain plus `search`) |
| Lesan relations              | 2 approved                                                |
| Predicates / claim types     | 5 / 3                                                     |
| User roles                   | 6                                                         |
| Invariants registered        | 15                                                        |
| Invariants active in plan 02 | 4                                                         |
| Test result                  | 28 passed, 0 failed, 12 ignored                           |
| Format/lint scope            | 30 files formatted, 29 linted (one archived/ignored path) |
| Replica-set round-trip       | 3 passed, 0 failed, 856 ms                                |

No latency, BSON-size, or index benchmarks were run; those belong to plans 03, 09, and 11. The local
topology is one node, not a production performance proxy.

## 5. Security negative tests

| Attempt                                    | Result                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Start with no environment                  | `config:check` rejects missing `MONGO_URL`, `DB_NAME`, `JWT_SECRET`                                                          |
| Use a short secret and non-replica-set URL | Rejected with both errors listed                                                                                             |
| Use a documented placeholder secret        | `mod.ts` throws `ConfigError` before any server work                                                                         |
| MongoDB URL with credentials in logs       | `redactMongoUrl` unit test passes; `config:check` prints the redacted form                                                   |
| Forbidden v1/v2 terms in production paths  | No matches                                                                                                                   |
| SSRF, projection leak, upload quarantine   | Not executable in plan 02 because the fetcher, projections, and upload pipeline do not exist; tracked by I04 and plans 06/08 |

## 6. Blocked and open items

- **I04-I11 and I13-I15** remain registered and ignored until plans 03-09. This is intentional; the
  inventory test prevents silent removal.
- **No HTTP server or production action exists.** `deno task start` validates config and exits
  non-zero; `deno task dev` stays in watch mode and repeats the same failure. Plans 03-08 replace
  this.
- **Transactions are not exercised.** The replica set is required and available; no multi-document
  domain operation exists yet.
- **Red-phase capture** for the four active invariants is the documented process deviation in
  Task 4.
- **Section 22 open decisions** (co-branding, obtainable identifier schemes, unique identifier
  index, shared review read model, transactions vs outbox, asset retention) are untouched.
- No new ADR is required.

## 7. Files changed

Production and shared code:

- `back/models/*.ts` - all eleven model headers and `models/mod.ts`; deleted `models/category.ts`.
- `back/src/mod.ts`, `back/src/category/` removed, `back/src/product/updateRelations/` cleaned of
  category assumptions.
- `back/utils/config.ts`, `back/utils/time.ts`, `back/utils/mod.ts`,
  `back/utils/domain/{constants,taxonomy,mod}.ts`.
- `back/deno.json`, `back/.env.example`, `back/mod.ts`, `back/taxonomy.v1.json`,
  `back/declarations/selectInp.ts`.
- `back/scripts/{check-config,generate-types}.ts`, `back/scripts/mongo-dev.sh`.
- `back/tests/{invariants,domain,infrastructure}/`.
- `back/archive/01-architecture-spike/` (moved spike and spike tests) plus `back/archive/README.md`.

Documentation:

- Root `AGENTS.md`, `back/AGENTS.md`, `front/AGENTS.md`.
- `back/docs/README.md`, `back/docs/summary.md`, `back/docs/plans/00-roadmap.md`,
  `back/docs/plans/02-foundation-and-invariants.md`, `back/docs/reports/README.md`,
  `back/docs/reports/02-foundation-and-invariants.md`.
- Historical banners on plan/prompt/report 01 were retained.

Frontend cleanup:

- Deleted `front/src/types/declarations/selectInp.ts`; kept `front/src/types/declarations/.gitkeep`.

Generated declarations are reproducible with `deno task types`. No archive file is imported by a
production module.

## 8. Verification

Exact output: `docs/reports/evidence/02-foundation-and-invariants/verification.log`.

```text
===== deno task fmt:check =====
Checked 30 files
EXIT: 0

===== deno task lint =====
Checked 29 files
EXIT: 0

===== deno task check =====
EXIT: 0

===== deno task test =====
ok | 28 passed | 0 failed | 12 ignored
EXIT: 0
```

Supporting evidence:

- `config-fail-fast.log` - missing config, weak secret, non-replica URL, placeholder secret, valid
  config.
- `mongo-replicaset.log` - `rs0` reaches `PRIMARY` on 27019.
- `time-integration.log` - UTC `Date` and `null` round-trip through the replica set.
- `types-generation.log` - declarations regenerate from `models/mod.ts`.
- `forbidden-terms.log` - production paths contain no forbidden v1/v2 terms.

Commands that were not run to success: `deno task dev` and `deno task start` cannot serve until the
server exists; `deno task db:dev` was exercised through its script. `deno run --allow-env mod.ts`
was checked and exits 1 on missing config. No production-deployment, load, or security-scanner test
was run in this plan.
