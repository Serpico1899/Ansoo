# Plan 10 - Data Acquisition and Research Operations (v3.1)

**Status:** Not started
**Depends on:** none (runs in parallel with 02-09)
**Feeds:** 09 (real seeds), 11 (data targets and Go/No-Go)
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`
**Roadmap:** `00-roadmap.md`

## Purpose

Prove that the product can acquire defensible data at an acceptable cost. Engineering alone produces a
schema; this workstream produces the evidence, sources, edges, methodology, and operational model that make
the platform worth using. It is equal in priority to engineering (spec Sections 18-19).

## Non-Goals

- No rebuilding of Rasmio or any aggregator.
- No circumvention of access caps, authentication, captchas, or paywalls.
- No publication of aggregator-derived datasets as original evidence.
- No real-world sensitive publication before legal counsel and the publication gate are ready.
- No synthetic data presented as real.

## Pre-Flight

- [ ] Read spec Sections 18-19, 21, 22, 24.
- [ ] Confirm access to Iranian infrastructure/proxy where required (for example Codal).
- [ ] Confirm licensing/terms for every source and dataset used.
- [ ] Confirm the research team roles and the legal-review path.
- [ ] Confirm the backend can capture Assets/Snapshots and create Relationships (plans 05-06). Until then,
  collect primary-source artifacts in a controlled staging area.

## Tasks

### 1. Install and validate acquisition tooling

- [ ] Install `rasmio-mcp`, `codal-mcp`, `iran-tax-mcp`, `rrk-mcp`, `qavanin-mcp`, `digikala-mcp`,
  `torob-mcp`, `okala-mcp`, `tsetmc-mcp`, and `iran-news-mcp` as needed, using `uvx` or the documented
  plugin path.
- [ ] Record exact package versions, install commands, and environment requirements.
- [ ] Validate each server with a read-only query; record sample outputs and failure modes.
- [ ] Confirm each tool's terms and rate limits; do not exceed guest caps or pace limits.
- [ ] Record which servers are unofficial scrapers and therefore require a production fallback.
- [ ] Document Codal pacing (>=2 s), Iranian-IP requirement, and `CODAL_MCP_PROXY` if used.

**Exit:** the toolchain is reproducible, versioned, and used within its terms.

### 2. Enforce the acquisition-tier rule

- [ ] Write the mapping from output type to `acquisitionTier`:

| Output | Tier | Role |
|---|---|---|
| Rasmio / Digikala / retailer data | `E_RESEARCH_OR_COMMUNITY` | lead only; never published evidence |
| Gazette notice PDF captured from `rrk.ir` | `B_OFFICIAL_PUBLIC_LOOKUP` | evidence |
| Codal statement/Excel from `codal.ir` | `A_OFFICIAL_MACHINE_READABLE` | first-grade evidence |
| Authenticated official registry access | `C_OFFICIAL_AUTHENTICATED_ACCESS` | evidence, access-restricted |
| Formal information-request response | `D_FORMAL_INFORMATION_REQUEST` | evidence |

- [ ] Add a code/registry check that refuses to attach Tier E output as `evidence[]` to a publishable
  finding.
- [ ] Store the primary-source artifact, not the aggregator's derived page, as the cited snapshot.
- [ ] Record publisher, origin, retrieval time, hash, and license/attribution metadata.
- [ ] Reject republishing a derived dataset as original; honor ODbL share-alike if Open Food Facts is used.

**Exit:** every evidence item has a primary-source artifact and a tier; aggregator output is lead-only.

### 3. Run the research pipeline on 10 brands

For each brand, execute and record:

1. [ ] Discover the brand/owner with `rasmio-mcp` or another lead source.
2. [ ] Search the Official Gazette by national ID/registration number for trademark/company notices.
3. [ ] Capture the notice PDF as Asset + SourceSnapshot + SHA-256 hash.
4. [ ] If listed, retrieve the relevant Codal filing/decision/Excel.
5. [ ] Draft the Relationship with subject/predicate/object, context, validity, sensitivity, and evidence.
6. [ ] Run the four-eyes assessment, gate, and right-of-reply workflow when the backend is ready.
7. [ ] Record unknowns and missing dates instead of inventing precision.

- [ ] Keep a per-brand log: sources tried, artifact paths, time spent, blockers, and outcome.
- [ ] Measure **researcher-minutes per edge** for every attempted edge.
- [ ] Record the failure modes: no notice, name mismatch, indirect ownership, unverifiable publisher,
  inaccessible filing, ambiguous brand, and missing GTIN.
- [ ] Do not publish sensitive findings during this plan unless the legal/publication gate is approved.

**Exit:** 10 brands processed with a defensible evidence trail or an explicit blocked reason.

### 4. Numeric targets and Go/No-Go

- [ ] 100 real Products with valid identifiers.
- [ ] 20 real Brands.
- [ ] 20 defensible ownership/import edges with full provenance.
- [ ] Record average and distribution of researcher-minutes per edge.
- [ ] Apply the Go/No-Go rule: if a routine edge averages more than 60 researcher-minutes, redesign the
  economics, not the schema. Expected agent-assisted range is 5-15 minutes per well-documented edge.
- [ ] Write a Go/No-Go recommendation with the measured data, not an opinion.

**Exit:** the numeric targets and minutes-per-edge are recorded; Go/No-Go is written.

### 5. Scanner-as-catalog-factory

- [ ] Define the contribution flow for an unknown GTIN: capture package photo + brand-on-package + optional
  receipt/store context.
- [ ] Ensure the public answer for unknown is honest: "We don't know yet; your photo became this product's
  first document."
- [ ] Treat `NOT_FOUND` as a contribution trigger, not an error.
- [ ] Define moderation and evidence requirements for contributed photos.
- [ ] Seed 30 high-turnover brands in one category deeply so early scans are not all empty.
- [ ] Do not infer origin, ownership, or legal status from a barcode.

**Exit:** the unknown-scan flow is specified and consistent with I02/I12.

### 6. Research operations and public artifacts

- [ ] Draft `methodology.md`: what counts as `SUPPORTED` per predicate/claim type, independence definition,
  limitations, wording rules, versioning, and change control.
- [ ] Define funding sources and editorial-independence policy.
- [ ] Define symmetric evidence standards: identical rigor for every target regardless of politics or
  popularity.
- [ ] Define the minimum viable team: Lead Researcher (full-time), Reviewer (~5 h/week), Product/Engineering
  owner (full-time).
- [ ] Define operator/researcher safety: hosting jurisdiction, legal structure, pseudonymity, access-log
  protection, and legal counsel before the first sensitive publication.
- [ ] Define the review-queue handoff from discovery to backend actions.
- [ ] Mark `methodology.md` as DRAFT until the research/editorial/legal owners approve it.

**Exit:** the mandatory public artifacts exist as drafts with named owners and approval status.

### 7. Data quality and provenance audit

- [ ] Spot-check 10% of captured artifacts: hash matches, URL resolves, publisher matches, date is real,
  license/attribution present.
- [ ] Flag secondary reporting and republications; do not count them as independent sources.
- [ ] Record every blocked policy question from spec Section 22 that affects acquisition.
- [ ] Ensure no real data or restricted artifact is committed to the repository; use the internal spike
  environment and a manifest.
- [ ] Ensure synthetic seeds are clearly fictional.

**Exit:** the dataset has a provenance manifest and no unlicensed content.

### 8. Report

- [ ] Write `reports/10-data-acquisition-and-research-operations.md`.
- [ ] Include tool versions, 10-brand log, minutes/edge distribution, targets, Go/No-Go, methodology status,
  legal blockers, and the first-category recommendation.

## Deliverables

1. Reproducible acquisition toolchain with terms/limits recorded.
2. Acquisition-tier enforcement rule.
3. 10-brand research log with primary-source artifacts.
4. Numeric targets and minutes-per-edge data.
5. Scanner/contribution flow specification.
6. Draft methodology, funding/independence policy, and symmetric-standards statement.
7. `reports/10-data-acquisition-and-research-operations.md`.

## Acceptance Criteria

1. Every publishable evidence item has a primary-source artifact and a tier.
2. Aggregator output is never cited as evidence.
3. Caps, pacing, licensing, and access terms are respected.
4. 100 Products / 20 Brands / 20 edges are met or the shortfall is explicitly reported.
5. Minutes-per-edge is measured and Go/No-Go is written.
6. Methodology and independence artifacts have owners and approval status.
7. No real/restricted data is committed; synthetic seeds are labeled.

## Verification Commands

```bash
cd back
deno task fmt:check
deno task lint
deno task check
deno task test
```

Plus the acquisition manifest, hash spot-check log, and minutes-per-edge spreadsheet or report table.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Unofficial scraper breaks | Record fallback/manual path; never depend on one server |
| Access caps or terms violated | Subscribe, pace, use official APIs; stop when blocked |
| Aggregator page cited as evidence | Tier enforcement; primary artifact required |
| Research cost too high | Measure minutes/edge; Go/No-Go before scaling |
| Sensitive publication without legal review | Legal counsel gate; no sensitive publish in this plan |
| Real data leaks into git | Internal environment + manifest; synthetic seeds only |
