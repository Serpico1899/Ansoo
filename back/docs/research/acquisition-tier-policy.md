# Acquisition-Tier Policy

**Status:** Enforced in code (2026-11-21), pending legal review of individual source terms.
**Plan:** 10, task 2
**Contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` Sections 8.2, 10.1, 18.3

## 1. The governing rule

> Aggregator and retailer output is a **lead**. A primary-source artifact is **evidence**.

No amount of corroboration turns an aggregator page into evidence. A finding may cite only a captured
artifact from an official or formal source. The tier describes how the artifact was obtained, not how
convenient the source is.

## 2. Output-to-tier mapping

| Output | Tier | Role in a finding |
|---|---|---|
| Rasmio company/brand/trademark profile, Digikala/Torob/Okala catalog, retailer page | `E_RESEARCH_OR_COMMUNITY` | Lead only. Never in `evidence[]`. Never published as proof. |
| Gazette notice PDF captured from `rrk.ir` | `B_OFFICIAL_PUBLIC_LOOKUP` | Evidence. |
| Codal statement, decision, or Excel captured from `codal.ir` | `A_OFFICIAL_MACHINE_READABLE` | First-grade evidence. |
| Authenticated official registry access | `C_OFFICIAL_AUTHENTICATED_ACCESS` | Evidence; access-restricted handling. |
| Formal information-request response | `D_FORMAL_INFORMATION_REQUEST` | Evidence; preserve the request and response. |

The role map is centralised in `utils/domain/constants.ts` as `ACQUISITION_TIER_ROLE` and
`isLeadOnlyAcquisitionTier()`. Do not duplicate the string literal in new code.

## 3. Enforcement points

| Layer | Rule | Failure |
|---|---|---|
| Snapshot creation | Any of the five tiers may be stored; a lead is a legitimate capture. | Validation rejects unknown tiers. |
| Evidence attach | `addEvidence()` / `addRelationshipEvidence()` resolve the snapshot and reject a lead-only tier before writing. | `422 LEAD_ONLY_TIER` |
| Evidence evaluation | A lead-only link is excluded from `entries` and listed in `leadOnlySnapshotIds`. It cannot satisfy a minimum. | Count and independence ignore it. |
| Publication gate | `sourceAccessOk` is false when any lead-only link is present. | Gate `FAIL` on `sourceAccessOk`. |
| Public projection | Only published/allowlisted evidence is exposed; leads never appear as provenance. | Projection must not name the aggregator as a source. |

Restricted or internal sources are rejected first with `422 RESTRICTED_CITATION`, even if they also
carry a lead-only tier. That preserves the more specific security error.

## 4. Primary-source capture contract

Every evidence item must be reproducible from the stored artifact:

1. **Artifact:** the primary PDF/HTML/Excel, stored in object storage. Never base64 in MongoDB.
2. **Source:** the publisher identity, canonical URL, source type, access, and publisher verification.
3. **Snapshot:** retrieval time in UTC, capture method, acquisition tier, content hash (SHA-256),
   MIME type, byte size, and lifecycle.
4. **Locator:** page, section, paragraph, timestamp, or URL fragment sufficient to find the cited text.
5. **Excerpt/rationale:** the exact wording relied on and why it supports or contradicts the claim.
6. **Rights:** licence code and attribution decision where the source requires them. A `DATASET`
   source is rejected without a licence code.

An aggregator's derived page may be stored as a lead snapshot for research notes. It must not be
attached to a finding and must not be the cited artifact.

## 5. Independence

Independence is a property of **publisher AND origin**, not a count of links.

- Two pages on the same publisher are one source.
- A republication, syndication, or translation of the same wire story is one source.
- A company's own statement and a regulator's copy of it are not independent for the proposition that
  the regulator verified it; they may be independent for the fact that the statement was made.
- The same fact repeated by ten aggregators is still one lead.

`evaluateEvidence()` computes unique publisher keys and unique origin hosts, then takes the smaller
number. This is deliberately conservative.

## 6. Derived datasets and licences

- Do not republish Rasmio, Digikala, Torob, Okala, or any other aggregator's derived dataset as
  original evidence or as an Ansoo dataset.
- If Open Food Facts is ever ingested, comply with ODbL attribution and share-alike for derived
  databases. Its Iranian coverage is too small to solve cold start.
- Record the licence code and attribution requirement on every `DATASET` source.
- A licence that forbids the intended use stops the acquisition. Do not proceed on a "probably fine"
  reading; escalate to legal review.

## 7. Operational checks

Before attaching evidence, a researcher asks:

1. Is this the publisher's own document, or someone's summary of it?
2. Does the captured bytes hash match the stored snapshot?
3. Is the URL the canonical primary URL, not a search-result redirect?
4. Is the tier correct for how I obtained it?
5. Is the source public, or is it restricted/internal?
6. Is the publisher independent of the other sources for this proposition?
7. Is the date real and recorded, or unknown? Never invent precision.

If any answer is no, the item is a lead or a blocked item, not evidence.
