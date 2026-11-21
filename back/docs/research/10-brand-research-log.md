# 10-Brand Research Log

**Status:** Discovery attempted; primary-source capture blocked (2026-11-21).
**Plan:** 10, task 3
**Data class:** Report-only leads. No source bytes, company identifiers, national IDs, or personal
data are committed. Owner names below are aggregator leads, not evidence.

## 1. Method

For each brand the researcher ran one read-only `rasmio-mcp` 0.2.0 `rs_search(kind=brands)` query.
No `rs_company` profile was opened, so the anonymous profile cap was not consumed. The result was
triaged for a plausible owner. The next required step, a gazette notice captured from `rrk.ir`, was
attempted and found to be unavailable through the validated toolchain:

- `rrk-mcp` 0.2.0 covers laws, regulations, and court rulings. Its own README excludes company
  registration notices.
- `rasmio-mcp` exposes only the five latest gazette ads, and only after a company profile call.
  The full ad archive is subscriber-only. An ad text from Rasmio is still Tier E.
- The previous plan assumption that `rrk-mcp` could search the Official Gazette by national ID or
  registration number is therefore false for this toolchain.

## 2. Per-brand log

Tool latency is wall-clock MCP round trip. "Triage" is analyst reading of the returned leads, not a
completed research operation. No edge was completed, so no researcher-minutes per edge were measured.

| ID | Brand | Category | Query latency | Aggregator owner lead | Triage | Blocker | Artifact | Outcome |
|---|---|---|---:|---|---|---|---|---|
| B01 | کاله | Dairy | 2.07 s | Solico Kalleh (private joint-stock) | Clear brand-owner signal | No primary gazette notice capture path | None | Lead only; blocked |
| B02 | میهن | Dairy / beverages | 1.74 s | Mihan Food Industries | Strong signal; other unrelated "Mihan" owners appear | No primary notice; name collision risk | None | Lead only; blocked |
| B03 | پگاه | Dairy | 1.64 s | Iran Dairy Industries (rows 2-3); first result is a person named Pegah | Name ambiguity; owner requires a second look | No primary notice | None | Lead only; blocked |
| B04 | دومینو | Ice cream / dairy | 3.39 s | Do Minu Dairy and Ice Cream | Clear brand-owner signal | No primary notice | None | Lead only; blocked |
| B05 | چیتوز | Snacks | 1.93 s | Dina Food Industries | Clear brand-owner signal | No primary notice | None | Lead only; blocked |
| B06 | بهنوش | Beverages | 1.84 s | Behnoush Iran (listed) | Clear signal; a Codal path may exist | No primary gazette notice; Codal not yet retrieved | None | Lead only; blocked |
| B07 | زمزم | Beverages | 2.36 s | Zamzam Iran | Clear brand-owner signal | No primary notice | None | Lead only; blocked |
| B08 | گلستان | Food | 2.35 s | Candidate owners are "Part Pishsaz Pouya Golestan" and unrelated metal/industrial companies | Ambiguous; the food brand owner is not established from top results | Ambiguous brand and no primary notice | None | Blocked; no edge |
| B09 | هراز | Food / rice | 1.95 s | Candidates are "Yaran Dasht Haraz", "Haraz Amol", and other unrelated marks | Ambiguous; brand owner not established | Ambiguous brand and no primary notice | None | Blocked; no edge |
| B10 | دامداران | Dairy | 1.64 s | Multiple cooperatives plus "Tine" dairy marks | Ambiguous; no single national brand owner established | Ambiguous brand and no primary notice | None | Blocked; no edge |

Discovery latency: mean **2.09 s**, median **1.94 s** across the ten queries. This is tool latency, not
researcher cost.

## 3. Failure modes observed

| Failure mode | Where it appeared | Consequence |
|---|---|---|
| Primary gazette search unavailable | All ten | No ownership edge can be defended. |
| Name collision / ambiguous brand | B02, B03, B08, B09, B10 | A brand search result is not proof of the brand's owner. |
| Person name equals brand name | B03 | The top result can be a natural person, not the company. |
| Unrelated marks with the same token | B08, B09 | Top-N triage is insufficient; a human must resolve the brand identity. |
| Aggregator-only owner claim | All ten | Tier E; cannot be cited or published. |
| No captured bytes | All ten | No hash, no retrieval time, no artifact manifest entry. |

## 4. What would unblock the pipeline

1. A licensed path to the Official Gazette notice archive, or an official registry API that returns
   the notice PDF by registration number.
2. A named Lead Researcher authorised to use that path and to record personal data under the research
   operations policy.
3. Legal review of the source terms and of the first sensitive ownership finding.
4. A controlled staging area outside git for the captured PDFs and their manifest.
5. Then, and only then, create canonical `Organization` and `Relationship` records with the captured
   artifact as evidence.

Until those exist, the correct outcome is **blocked**, not a synthetic edge.
