# Ansoo Backend Documentation

This directory is the backend's planning, decision, and evidence record. The **canonical domain
contract** is `../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` (CT-DOMAIN-SPEC v3.1). If any file here
conflicts with it, the spec wins and the conflicting file must be corrected.

The old `CONSUMER_TRANSPARENCY_FINAL_ERD.md` and the decisions in plan 01/report 01 were produced against
the superseded v1/v2 draft. They remain useful as engineering evidence, but their domain decisions do not
override v3.1. See `adr/0001-v3.1-single-canonical-spec.md`.

## Reading Order

1. `../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` - domain contract; read in full before domain work.
2. `../AGENTS.md` and `../../AGENTS.md` - repository and backend execution rules.
3. `summary.md` - condensed, agent-friendly v3.1 summary.
4. `plans/00-roadmap.md` - sequence, dependencies, gates, and plan index.
5. The active plan, then its matching prompt in `prompts/`.
6. `reports/` - evidence produced by completed plans.

## Status

| Area | State |
|---|---|
| Domain specification | v3.1 canonical (LOCKED baseline) |
| Backend code | Models, domain services, the authenticated action/dispatcher layer, and the public profile/read model implemented |
| Architecture spike | Complete against the superseded draft; archived under `archive/01-architecture-spike/` |
| Execution plans | Plans 02-11 complete (2026-11-21); plan 01 is historical |
| Data acquisition | Toolchain and tier rule validated; primary-source capture blocked (plan 10) |
| Production readiness | Blocked: report 11 is NO-GO (data, legal, S15, S16, S18) |

## Documentation Map

| Path | Purpose |
|---|---|
| `summary.md` | Condensed v3.1 domain model, boundaries, decisions, open questions |
| `methodology.md` | DRAFT operating methodology; owned by research/editorial/legal |
| `adr/` | Architecture Decision Records and the ADR index |
| `plans/00-roadmap.md` | Master delivery sequence and dependency graph |
| `plans/01-architecture-spike.md` | Historical spike plan (superseded domain assumptions) |
| `plans/02-foundation-and-invariants.md` | v3.1 alignment, shared types, invariant test harness, infrastructure |
| `plans/03-models-contracts-and-indexes.md` | Eleven collections, embedded contracts, caps, indexes |
| `plans/04-identity-normalization-and-resolution.md` | Persian normalization, identifiers, registry, resolution, search |
| `plans/05-graph-claims-and-publication-gates.md` | Relationships, claims, status machines, sensitivity, gates, right of reply |
| `plans/06-provenance-assets-and-capture.md` | Sources, immutable snapshots, assets, hashing, SSRF-safe capture |
| `plans/07-governance-audit-corrections-and-users.md` | Append-only audit, correction application, users, retention, abuse |
| `plans/08-auth-projections-and-api-contract.md` | JWT/roles, capability matrix, public/research/admin projections, generated contract |
| `plans/09-public-profile-read-model-and-vertical-slice.md` | Profile assembly, inheritance, read model, retraction, S19 |
| `plans/10-data-acquisition-and-research-operations.md` | iran-mcp pipeline, primary-source evidence, methodology, Go/No-Go |
| `plans/11-verification-hardening-and-launch.md` | S01-S30, stage gates, performance, security, production launch gate |
| `prompts/` | One execution prompt per active plan |
| `reports/` | Completed-plan evidence packs and decision reports |
| `reports/evidence/` | Raw logs and benchmark artifacts |

## Rules for These Documents

- Plans are executable: every task has a concrete exit condition and a verification command.
- Do not implement anything that is not in the canonical spec or an accepted ADR.
- Do not silently decide one of the six genuinely open questions in spec Section 22.
- New domain data, collections, fields, or predicates require a short ADR first.
- Update the owning plan and report when reality contradicts the plan; do not leave stale instructions.
- Never paste secrets, tokens, private personal data, or restricted source content into docs or evidence logs.
