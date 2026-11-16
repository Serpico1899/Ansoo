# Ansoo Methodology

**Status:** DRAFT - not approved for publication
**Version:** 0.1-draft
**Owners:** Research lead, editorial lead, legal reviewer (named owners required before publication)
**Contract:** `../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`

> This file is a structured placeholder, not a policy. Do not publish it or encode its TODOs as defaults.
> The research, editorial, and legal owners must approve each section. `EvidenceAssessment.methodologyVersion`
> must point to an approved version of this document.

## 1. Purpose and Scope

Explain what Ansoo claims to do, what it does not claim, and which questions this methodology answers.

- [ ] Scope: product transparency, identity, relationships, claims, evidence, provenance, limitations.
- [ ] Non-goals: no universal ethical/legal score, no boycott recommendation, no legal advice, no
  nationality inference from identifiers.
- [ ] Symmetric standards: identical rigor for every target regardless of politics or popularity.

## 2. Evidence Grades and Independence

- [ ] Define the acquisition tiers and what each can support.
- [ ] Define "independent": different publisher **and** different origin; republications of one wire story
  count as one source.
- [ ] Define acceptable primary-source artifacts and how they are captured, hashed, and cited.
- [ ] State that aggregator/retailer data is discovery only and never published evidence.
- [ ] Define how secondary reporting and translations are labeled as limitations.

## 3. Assessment Outcomes

Define each outcome precisely and the public wording allowed for it.

| Outcome | Definition | Public wording constraints |
|---|---|---|
| `SUPPORTED` | Reviewed evidence supports the precisely worded proposition within its scope and dates | [TODO: approved wording] |
| `PARTIALLY_SUPPORTED` | Only part is supported; public wording must be narrowed | [TODO] |
| `NOT_SUPPORTED` | Available evidence does not support the proposition; this does not prove its opposite | [TODO] |
| `DISPUTED` | Credible evidence or interpretations materially conflict; not merely a user disagreement | [TODO] |
| `INCONCLUSIVE` | Insufficient evidence for a defensible conclusion | [TODO] |
| `NOT_ASSESSED` | No conclusion reached | [TODO] |

- [ ] Define the minimum evidence per sensitivity level (ROUTINE/SENSITIVE/HIGH_RISK).
- [ ] Define the four-eyes and legal sign-off requirements.
- [ ] Define who may assess, review, publish, and retract.

## 4. Predicate and Claim Semantics

For each predicate: meaning, direction, required context, evidence standard, inverse label, and examples.

| Predicate | What it means | Evidence standard | Inverse label | Notes |
|---|---|---|---|---|
| `OWNS` | [TODO] | [TODO] | owned by | share/basis when documented |
| `CONTROLS` | [TODO] | [TODO] | controlled by | basis required |
| `MANUFACTURES` | [TODO] | [TODO] | manufactured by | package label may be ROUTINE |
| `DISTRIBUTES` | [TODO] | [TODO] | distributed by | market required |
| `IMPORTS_TO_MARKET` | [TODO] | [TODO] | imported by | market required |

For each claim type: precise proposition shape, structured fields, evidence standard, and public wording.

| Claim type | Proposition | Evidence standard | Notes |
|---|---|---|---|
| `MARKET_PRESENCE` | [TODO] | [TODO] | channel/observation basis |
| `PRODUCT_ORIGIN` | [TODO] | [TODO] | conflicts must be explicit |
| `OFFICIAL_STATEMENT` | [TODO] | [TODO] | speaker/date/channel |

## 5. Dates, Validity, and Unknowns

- [ ] Define valid time vs recorded time.
- [ ] Define `datePrecision` and when a date is unknown.
- [ ] State that `validTo: null` is not proof of current truth.
- [ ] Define how unknowns and conflicts are displayed.
- [ ] Prohibit guessing dates from vague wording.

## 6. Right of Reply and Organization Responses

- [ ] Define when solicitation is required and the default deadline.
- [ ] Define acceptable channels and proof of sending.
- [ ] Define how responses are attributed and verified.
- [ ] State that a response never automatically changes an assessment.
- [ ] Define publication/redaction rules for responses.

## 7. Sensitivity and Legal Review

- [ ] Define ROUTINE/SENSITIVE/HIGH_RISK classification examples.
- [ ] Define the legal sign-off threshold and who provides it.
- [ ] Define the narrow waiver rules and who may approve them.
- [ ] Define the escalation path for legal exposure or named individuals.
- [ ] State that this document is not legal advice.

## 8. Corrections, Retractions, and Change Control

- [ ] Define how corrections are submitted, reviewed, and applied.
- [ ] Define the public correction notice and previous wording disclosure.
- [ ] Define retraction triggers and the synchronous removal SLO.
- [ ] Define versioning and approval of this methodology.
- [ ] Define how disagreements with a published finding are handled.

## 9. Research Operations and Safety

- [ ] Define team roles: Lead Researcher, Reviewer, Product/Engineering owner.
- [ ] Define researcher pseudonymity, access-log protection, and hosting-jurisdiction considerations.
- [ ] Define legal counsel before the first sensitive publication.
- [ ] Define conflict-of-interest and funding disclosure.
- [ ] Define researcher-minutes measurement and throughput reporting.

## 10. Approval Record

| Version | Date | Research lead | Editorial lead | Legal reviewer | Status |
|---|---|---|---|---|---|
| 0.1-draft | 2026-11-16 | TBD | TBD | TBD | Draft |
