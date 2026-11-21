# Ansoo Methodology

**Status:** DRAFT - not approved for publication
**Version:** 0.2-draft
**Owners:** Lead Researcher (unassigned), Reviewer (unassigned), Legal reviewer (unassigned)
**Contract:** `../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`

> This is a draft operating methodology, not an approved policy. `EvidenceAssessment.methodologyVersion`
> must point to an approved version, not to this draft. No sensitive finding may be published until
> the research, editorial, and legal owners approve it.

## 1. Purpose and Scope

Ansoo resolves a product identifier to a transparent profile: identity, brand mapping, organizations,
time-aware relationships, published claims, evidence, sources, corrections, responses, unknowns, and
limitations.

It does **not** produce a universal ethical, legal, or boycott score. It does not infer ownership,
manufacturing country, nationality, or legal status from a barcode, GS1 prefix, or brand name. It
does not give legal advice.

The same standard applies to every target. Politics, popularity, size, nationality, funding, and the
researcher's personal view do not change the evidence bar.

## 2. Evidence Grades and Independence

### 2.1 Acquisition tiers

| Tier | Meaning | Role |
|---|---|---|
| `A_OFFICIAL_MACHINE_READABLE` | Official source, machine-readable capture (for example a Codal Excel/PDF) | First-grade evidence |
| `B_OFFICIAL_PUBLIC_LOOKUP` | Official public page or notice captured as an artifact (for example a gazette PDF) | Evidence |
| `C_OFFICIAL_AUTHENTICATED_ACCESS` | Official registry reached through authenticated access | Evidence, access-restricted |
| `D_FORMAL_INFORMATION_REQUEST` | Formal request and response | Evidence |
| `E_RESEARCH_OR_COMMUNITY` | Aggregator, retailer, community, or other research lead | Lead only; never evidence |

The enforced rule is in `../utils/domain/constants.ts` and `../utils/provenance/evidence.ts`. A Tier E
snapshot cannot enter `evidence[]`; `422 LEAD_ONLY_TIER` is returned. A legacy Tier E link is excluded
from evidence counting and blocks the publication gate.

### 2.2 What counts as an artifact

An artifact is the publisher's own bytes: a PDF, HTML page, Excel workbook, image, or formal response.
A search-result snippet, a JSON summary from a scraper, an aggregator profile, or a retailer page is a
lead, not an artifact.

An evidence item must record: the source, the snapshot, the SHA-256 hash, the retrieval time in UTC,
the capture method, the tier, a locator, and the exact excerpt or rationale. A `DATASET` source also
needs a licence code and attribution decision.

### 2.3 Independence

Independence is **publisher AND origin**, not a count of links.

- Two pages from one publisher are one source.
- A republication or translation of one wire story is one source.
- Multiple aggregators repeating one claim are one lead.
- A company's own statement and a regulator's copy are not independent for the proposition that the
  regulator verified the claim; they may be independent for the fact that the statement was made.

The evaluator takes the smaller of unique publisher keys and unique origin hosts. This is deliberately
conservative.

## 3. Assessment Outcomes

| Outcome | Definition | Public wording constraints |
|---|---|---|
| `SUPPORTED` | Reviewed evidence supports the precisely worded proposition within its scope and dates. | State the scope, dates, and evidence limits. Do not generalise beyond them. |
| `PARTIALLY_SUPPORTED` | Only part of the proposition is supported. | Publish narrowed wording; the unsupported part is explicit. |
| `NOT_SUPPORTED` | Available evidence does not support the proposition. | This does not prove the opposite. Say "not supported by available evidence", not "false". |
| `DISPUTED` | Credible evidence or interpretations materially conflict. | Show both sides and the conflict; do not pick a winner without evidence. |
| `INCONCLUSIVE` | Insufficient evidence for a defensible conclusion. | Say what is missing and what would change the answer. |
| `NOT_ASSESSED` | No conclusion reached. | Do not present as a finding. |

Minimum evidence by sensitivity:

| Sensitivity | Minimum | Four-eyes |
|---|---|---|
| `ROUTINE` | 1 verified snapshot | Author != assessor |
| `SENSITIVE` | 2 independent sources **or** 1 official registry snapshot (Tier A/B) | Author != assessor != publisher |
| `HIGH_RISK` | 2 independent sources **and** at least 1 official source | Author != assessor != publisher, plus legal sign-off |

A `SUPPORTED` outcome must meet the minimum. A `PARTIALLY_SUPPORTED` outcome needs a narrowed public
wording. An unsupported or inconclusive outcome does not become a negative verdict.

## 4. Predicate and Claim Semantics

### 4.1 Relationships

| Predicate | Meaning | Endpoint rule | Required context | Evidence standard | Inverse label |
|---|---|---|---|---|---|
| `OWNS` | Subject owns object. Ownership is not operational control. | Organization -> Organization or Brand | Share and basis when documented | SENSITIVE: 2 independent or 1 official registry A/B | owned by |
| `CONTROLS` | Subject exercises documented control. | Organization -> Organization or Brand | `ownership.basis` is required | SENSITIVE: 2 independent or 1 official registry A/B | controlled by |
| `MANUFACTURES` | Subject manufactures object. | Organization -> Product | — | ROUTINE from a package label may be 1 verified snapshot; otherwise follow sensitivity | manufactured by |
| `DISTRIBUTES` | Subject distributes object in a market. | Organization -> Product or Brand | `marketCountryCode` required | SENSITIVE: 2 independent or 1 official registry A/B | distributed by |
| `IMPORTS_TO_MARKET` | Subject imports object into a market. | Organization -> Product | `marketCountryCode` required | SENSITIVE: 2 independent or 1 official registry A/B | imported by |

A new owner or period is a new edge. Never rewrite an old edge's subject to show a new owner. An
overlap is a review flag, not an automatic duplicate or rejection. `SUBSIDIARY_OF` does not exist; it
is an inverse label rendered at read time.

### 4.2 Claims

| Claim type | Proposition shape | Evidence standard | Notes |
|---|---|---|---|
| `MARKET_PRESENCE` | The product is offered in a named market through a named channel, with an observation basis. | ROUTINE from an official list or a verified primary observation; otherwise SENSITIVE | Aggregator catalogs are leads only. |
| `PRODUCT_ORIGIN` | The product originates from a named place or entity under a stated basis. | Conflicting origin claims are SENSITIVE | Barcode/GS1 prefix is never proof. Unknown stays unknown. |
| `OFFICIAL_STATEMENT` | A named speaker made a stated claim on a stated date through a stated channel. | 1 verified snapshot of the statement; scope is exact | Record speaker, date, channel, and exact wording. A statement is not proof of its content. |

No claim type is a general "other" escape hatch.

## 5. Dates, Validity, and Unknowns

- `validFrom`/`validTo` are real-world validity. `recordedAt`/`createdAt` are platform time. They are
  not interchangeable.
- `validTo: null` means no end date is recorded. It does not prove the relationship is current today.
- `datePrecision` must be honest: `DAY`, `MONTH`, `YEAR`, or `UNKNOWN` as defined by the domain.
- Unknown dates stay `null`. Never infer a date from a vague phrase, a file name, a page order, or a
  stock price.
- Unknown ownership, origin, or status is displayed as unknown. It is not filled with a plausible
  guess.
- Conflicting dates are shown as a conflict, not silently resolved.

## 6. Right of Reply and Organization Responses

- SENSITIVE and HIGH_RISK findings require a right-of-reply solicitation before publication.
- The default deadline is set by policy; until approved, use the configured default and record it.
- A pending deadline blocks publication. A response received or a deadline elapsed satisfies the
  check; silence is not agreement.
- Record the channel, sender, deadline, assertions summary, outcome, and proof of sending.
- A response never automatically changes an assessment. It is attributed and reviewed.
- Public responses are allowlisted. Never expose private contact data, personal data, or unpublished
  correspondence.

## 7. Sensitivity and Legal Review

- `ROUTINE`: package label, published catalog identity, a low-controversy market observation.
- `SENSITIVE`: ownership, control, import/distribution, conflicting origin, named-organization
  assertions, anything a reasonable reader could read as an accusation.
- `HIGH_RISK`: legal status, sanctions, criminal allegations, named individuals, or a finding likely
  to cause serious reputational or legal harm.
- Legal sign-off is mandatory for HIGH_RISK and for the first sensitive publication. It is not
  waivable.
- Waivers are narrow, ADMIN-only, reasoned, and audited. A waiver cannot override a non-waivable
  check.
- Escalate to counsel on legal exposure, threats, or a named individual. This document is not legal
  advice.

## 8. Corrections, Retractions, and Change Control

- A correction is a proposal. The submitter never edits canonical data directly.
- `fieldKey`, `operation`, and `proposedValue` are validated against a strict per-target allowlist.
- Approval is not application. Application runs through a domain action with authorization, an
  expected-version check, idempotency, and an audit event.
- A correction increments the version. History is preserved.
- A retraction removes the finding from the public document, read model, cache, and index within the
  SLO. The audit trail is preserved.
- A public correction notice states what changed, when, and why, without exposing restricted evidence.
- This methodology is versioned. A change needs an owner review and a new version. `methodologyVersion`
  on an assessment must point to an approved version.

## 9. Research Operations and Safety

- Minimum team: Lead Researcher (full-time), Reviewer (~5 h/week), Product/Engineering owner
  (full-time), Legal reviewer (as needed).
- Funding and editorial independence are disclosed. A funder cannot choose targets, suppress
  findings, preview drafts, or receive a privileged correction path.
- Researcher pseudonymity, access-log protection, hosting jurisdiction, and legal structure are design
  inputs. Legal counsel is required before the first sensitive publication.
- Researcher-minutes per edge are measured and reported. A routine edge above 60 researcher-minutes
  triggers an economics redesign, not a schema change.
- The review-queue handoff is discovery -> primary capture -> draft -> four-eyes -> gate -> right of
  reply -> legal -> publish -> correct/retract.
- Operators follow source terms: caps, pacing, licences, and access restrictions. A cap or captcha is
  a stop, not a challenge to defeat.

## 10. Approval Record

| Version | Date | Lead Researcher | Reviewer | Legal reviewer | Status |
|---|---|---|---|---|---|
| 0.1-draft | 2026-11-16 | TBD | TBD | TBD | Placeholder |
| 0.2-draft | 2026-11-21 | Unassigned | Unassigned | Unassigned | Draft; not approved |
