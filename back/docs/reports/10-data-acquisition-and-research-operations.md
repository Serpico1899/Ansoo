# Plan 10 - Data Acquisition and Research Operations

**Status:** Complete with acquisition blockers (2026-11-21)
**Plan:** `../plans/10-data-acquisition-and-research-operations.md`
**Contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` Sections 18-19, 21
**Evidence:** `evidence/10-data-acquisition-and-research-operations/`

## 1. Executive summary

The toolchain is technically viable: all ten `iran-mcp` servers install, initialize over MCP, list
their tools, and answer a small read-only probe. The tier rule is now enforced in code and covered by
tests. The acquisition target is **not** met. No defensible ownership edge was completed.

The decisive blocker is not the schema or the scraper. It is the missing primary-source path:

- `rrk-mcp` does not search company registration/trademark notices. It covers laws, regulations, and
  court rulings only.
- Rasmio exposes five latest gazette ads and requires a company profile call; the full archive,
  parent/subsidiary data, and relationship graph are subscriber-only.
- The previous plan assumption that `rrk-mcp` could search the Official Gazette by national ID or
  registration number is false for the validated versions.
- Current upstream releases are PolyForm Noncommercial, not MIT. The work pins the last MIT releases.

**Recommendation:** No-Go for scaling ownership/import data until a licensed primary gazette or
registry path, a named research team, and legal review exist. Do **not** redesign the schema. The
missing input is a source contract, not a model.

## 2. Scope and method

The plan asks for a reproducible toolchain, a tier rule, a 10-brand pipeline, numeric targets,
minutes-per-edge, a scanner contribution flow, research-operations artifacts, and a provenance audit.

This execution:

1. Pinned and validated ten MIT releases in an isolated `/tmp` toolchain.
2. Ran one small read-only probe per server and recorded shape and latency, not raw data.
3. Added and tested lead-only tier enforcement for Claims and Relationships and the publication gate.
4. Ran ten brand-discovery queries and triaged the results. No `rs_company` profile was opened.
5. Stopped at primary-source capture because no supported path exists.
6. Wrote the tier policy, 10-brand log, scanner flow, research-operations draft, and methodology draft.
7. Hashed every committed artifact and spot-checked all of them (100%, above the 10% requirement).

No source bytes, company national IDs, personal data, or restricted artifacts were committed.

## 3. Toolchain and licence

- `uv` 0.13.9, SHA-256 verified, isolated cache.
- Ten servers, 110 tools total.
- Last MIT releases pinned: `rasmio-mcp` 0.2.0, `codal-mcp` 0.2.1, `iran-tax-mcp` 0.2.0,
  `rrk-mcp` 0.2.0, `qavanin-mcp` 0.2.1, `digikala-mcp` 0.6.1, `torob-mcp` 0.2.1, `okala-mcp` 0.4.0,
  `tsetmc-mcp` 0.2.0, `iran-news-mcp` 0.3.0.
- Current releases are PolyForm Noncommercial. A commercial deployment must keep the MIT pins, obtain
  a commercial licence, or replace the server with an official path.
- Terms and caps recorded in `../research/acquisition-toolchain.md`.

**Ruling:** pin MIT releases rather than the latest. The spec says MIT; the latest upstream releases
do not. Cost if wrong: the pinned versions may lack later fixes, and an upgrade needs a licence review.

## 4. Acquisition-tier enforcement

The rule is no longer only documentation. It is enforced at three layers:

| Layer | Behaviour |
|---|---|
| Attach | `addEvidence()` and `addRelationshipEvidence()` reject a Tier E snapshot with `422 LEAD_ONLY_TIER`, even when the publisher is public and verified. |
| Evaluation | Tier E links are excluded from evidence entries and counted in `leadOnlySnapshotIds`; they cannot satisfy a minimum. |
| Gate | `sourceAccessOk` is false when any lead-only link exists, so publication fails. |

Tests added:

- `tests/provenance/evidence.integration.test.ts`: public verified aggregator snapshot cannot be
  attached; no version bump and no link are written.
- `tests/research/gate.integration.test.ts`: a finding with an aggregator link fails the gate on
  `sourceAccessOk`.

Restricted/internal sources still fail first with `422 RESTRICTED_CITATION`; that is the more
specific security error.

## 5. Ten-brand log

Ten dairy, snack, and beverage brands were searched. Discovery is cheap; evidence capture is not.

| Result | Count |
|---|---:|
| Brands queried | 10 |
| Clear owner lead from top results | 7 |
| Ambiguous brand/owner | 3 |
| Primary gazette artifact captured | 0 |
| Defensible edge completed | 0 |

Discovery latency: mean **2.09 s**, median **1.94 s**. This is tool round-trip, not researcher cost.
The full log with per-brand blockers is in `../research/10-brand-research-log.md`.

Failure modes observed: primary gazette search unavailable, name collision, a person whose name is
also a brand, unrelated marks with the same token, aggregator-only owner claims, and no captured bytes.

## 6. Numeric targets and minutes per edge

| Target | Required | Measured | Status |
|---|---:|---:|---|
| Real Products with valid identifiers | 100 | 0 | Not met |
| Real Brands | 20 | 0 | Not met |
| Defensible ownership/import edges | 20 | 0 | Not met |
| Researcher-minutes per edge | measured | not measured | No edge completed |

The shortfall is explicit, not hidden. Creating 20 Brands or 100 Products from Tier E leads would
violate the evidence rule and the "no synthetic data presented as real" rule. The correct number is
zero until primary capture exists.

## 7. Go/No-Go

**No-Go for scaling ownership/import acquisition under the current source access.**

Reasons:

1. The validated gazette tool cannot search company notices.
2. Rasmio's relevant archive and graph are subscriber-only, and its public profile cap is small.
3. No licensed primary-source path or official API has been procured.
4. No named Lead Researcher or legal reviewer has accepted the duties.
5. No edge was completed, so the 60-minute rule cannot be evaluated. The expected 5-15 minute range
   remains an assumption, not a measurement.

**What would turn it to Go:** a licensed gazette/registry feed or official API that returns the
notice PDF by registration number; a named researcher; legal review of the source terms; and a
controlled staging area. Discovery cost is already low enough that the economics are plausible once
the capture path exists.

## 8. Scanner flow and first category

The contribution flow is specified in `../research/scanner-contribution-flow.md`.

- `NOT_FOUND` is a contribution trigger, not an error.
- Capture package front, barcode, brand text, and optional receipt/store context.
- Create a provisional Product with `lifecycle: INACTIVE`, an `UNVERIFIED` GTIN, and the package
  snapshot. Keep the asset private and quarantined until moderation.
- The public answer is honest: the photo is the product's first document, not a published finding.

**Critical gap:** a user photo is Tier E and is lead-only under the current rule. It can create a
catalog candidate, but it cannot by itself support a published `MANUFACTURES` or ownership finding.
Do not relabel it as Tier A/B to bypass the gate. The spec owners must decide whether a moderated user
capture becomes a new evidence class.

**First category: dairy.** High turnover, barcode on almost every unit, concentrated brands, and some
listed owners. Do not seed real brands until the primary-source path and the contribution evidence
rule exist. Synthetic seeds must be clearly fictional and must not use real brand names or GTINs.

## 9. Methodology and research-operations artifacts

| Artifact | Status | Owner |
|---|---|---|
| `docs/methodology.md` | DRAFT 0.2-draft | Unassigned |
| `docs/research/research-operations.md` | DRAFT | Unassigned |
| `docs/research/acquisition-toolchain.md` | Validated; licence/terms recorded | Engineering |
| `docs/research/acquisition-tier-policy.md` | Enforced in code | Engineering |
| `docs/research/scanner-contribution-flow.md` | Draft specification | Product/Research |

Funding disclosure, editorial independence, named owners, hosting jurisdiction, legal structure, and
legal counsel do not yet exist. These are publication blockers for sensitive findings.

## 10. Provenance audit

All committed artifacts are hashed in
`evidence/10-data-acquisition-and-research-operations/provenance-manifest.tsv`. The manifest records
path, SHA-256, byte size, and role. Spot-check:

- Sample: **all** manifest entries (100%), not 10%.
- Checks: hash matches, path exists, file is in the repository, no secret or personal data, no real
  source bytes.
- Result: pass. The spot-check record is
  `evidence/10-data-acquisition-and-research-operations/hash-spot-check.md`.

No captured research artifacts exist, so there is no 10% sample of primary PDFs to check. That is a
consequence of the blocker, not a skipped check.

## 11. Verification

| Command | Result |
|---|---|
| `deno task fmt` | Pass (151 files) |
| `deno task fmt:check` | Pass |
| `deno task lint` | Pass (150 files) |
| `deno task check` | Pass |
| `deno task config:check` (with dev env) | Pass |
| `RUN_MONGO_TESTS=1 deno task test` | **152 passed, 184 steps, 0 failed, 9 ignored** in 1m25s |

Targeted TDD evidence: the aggregator tests failed before the fix (`test-targeted-red.log`) and passed
after (`test-targeted-green.log`). Full output is in `test-full.log`.

## 12. Blockers and open decisions

| Blocker | Owner | Effect |
|---|---|---|
| No primary gazette/registry notice path | Product/Research | No defensible ownership edge. |
| Rasmio archive/graph subscriber-only; 5-profile cap | Product/Research | Discovery only; no evidence. |
| Current `iran-mcp` releases are PolyForm Noncommercial | Engineering/Legal | Pin MIT or buy a licence. |
| Codal/tax sites often require Iranian IP and pacing | Operations | Need Iranian infrastructure or licensed proxy. |
| No named researcher, reviewer, or legal counsel | Founders | Sensitive publication blocked. |
| No funding/independence disclosure | Founders | Sensitive publication blocked. |
| User-photo evidence class undefined | Spec owners | Scanner cannot publish from a photo alone. |
| Gazette notice access method (official API vs manual) | Spec Section 22 | Affects throughput and cost. |

## 13. Rulings and limits

- **Tool licence:** pinned last MIT releases because current releases are noncommercial. Cost if wrong:
  older versions may lack fixes.
- **Tool validation:** one probe per server, not a full field validation. Cost if wrong: a tool may
  answer the probe and still fail a real query.
- **Brand pipeline:** stopped at primary capture; did not create canonical records from Tier E leads.
  Cost if wrong: slower start, but no false ownership.
- **Targets:** reported as zero rather than filled with synthetic or unverified data. Cost if wrong:
  the plan's numeric target is unmet.
- **Scanner evidence:** user photos remain lead-only until a spec-approved class exists. Cost if
  wrong: the flywheel is slower than the concept pitch.
- **Go/No-Go:** No-Go for scaling under current access. Cost if wrong: a viable path may be delayed
  until a licence is purchased.

No sensitive finding was published. No real data or restricted artifact was committed.

## 14. Deliverables

1. `../research/acquisition-toolchain.md` - reproducible toolchain, versions, terms, limits, fallbacks.
2. `../research/acquisition-tier-policy.md` - mapping and enforcement.
3. `../research/10-brand-research-log.md` - ten-brand log and blockers.
4. This report - targets, minutes data, Go/No-Go, legal blockers, first category.
5. `../research/scanner-contribution-flow.md` - unknown-GTIN contribution flow.
6. `../research/research-operations.md` and `../docs/methodology.md` - draft operations and methodology.
7. `evidence/10-data-acquisition-and-research-operations/` - validation, tests, hashes, spot-check.
