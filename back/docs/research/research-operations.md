# Research Operations and Independence

**Status:** DRAFT - not approved (2026-11-21)
**Plan:** 10, task 6
**Contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` Sections 19.1-19.3
**Owners:** Lead Researcher (unassigned), Reviewer (unassigned), Product/Engineering owner
(unassigned), Legal reviewer (unassigned)

> No individual has been named or has accepted these duties. Until they do, no sensitive finding may
> be published. This document is an operating draft, not a claim of independence.

## 1. Minimum viable team

| Role | Responsibility | Load | Current status |
|---|---|---|---|
| Lead Researcher | Run the pipeline, record findings, own the methodology, maintain the manifest | Full-time | Unassigned |
| Reviewer | Independent assessment, four-eyes, publication gate, right-of-reply check | ~5 h/week | Unassigned |
| Product/Engineering owner | Product, engineering, legal, funding; protect editorial independence | Full-time | Unassigned |
| Legal reviewer | Source terms, sensitive publication, corrections, defamation risk | As needed | Unassigned |

Throughput assumption: 10 edges/day x 20 days is about **200 edges/month**. This is a planning
assumption, not a measured result. Plan 10 measured no completed edge, so the assumption remains
unvalidated.

## 2. Funding and editorial independence

Rules:

1. Disclose every funding source above a threshold set by the board, including grants, subscriptions,
   services, and in-kind support.
2. No funder may choose a target, suppress a finding, preview a draft for approval, or receive a
   privileged correction path.
3. Sponsored content, if ever allowed, is labelled and kept outside the finding pipeline.
4. A funder with a direct interest in a target is disclosed on the finding and is excluded from the
   review of that target.
5. The publication decision belongs to the Reviewer and the Product/Engineering owner under the gate,
   not to a funder.
6. Gifts, travel, and hospitality are recorded in a register with a named approver.
7. The funding and independence policy is reviewed at least annually and on any change of control.

Current status: **no funding disclosure exists**. This is a publication blocker for any sensitive
finding.

## 3. Symmetric evidence standards

The same evidence standard applies to every target, regardless of politics, popularity, size,
nationality, or the researcher's personal view.

- The predicate and claim-type matrix is fixed in the domain spec. Do not add a lower bar for a
  preferred target or a higher bar for a disfavoured one.
- A powerful company and a small cooperative face the same tier, independence, four-eyes, and
  right-of-reply rules.
- A finding about a state-owned entity, a politically connected company, or a campaign target is not
  published on weaker evidence because the claim is "obvious".
- A finding that pleases a funder or a campaign is not published faster. A finding that displeases
  them is not delayed.
- If the evidence is asymmetric, the finding is `INCONCLUSIVE`, `PARTIALLY_SUPPORTED`, or not
  published. The limitation is stated, not hidden.
- Translation, republication, and secondary reporting are labelled and do not count as independent
  sources.

## 4. Operator and researcher safety

These are design inputs, not an appendix.

| Risk | Control |
|---|---|
| Hosting jurisdiction | Choose a jurisdiction with counsel who can advise on publication and data protection. Record the choice. |
| Legal structure | Separate the editorial entity from the engineering operator where practical. Record ownership and control. |
| Researcher pseudonymity | Public surfaces show roles, not personal identities. Internal access is role-based. Do not expose researcher names in public profiles or audit projections. |
| Access-log protection | Restrict logs, redact tokens and personal data, set retention, and alert on bulk access. |
| Device and account hygiene | Separate research accounts from personal accounts; no shared passwords; MFA where available. |
| Source protection | Do not expose a source's identity, contact details, or unpublished documents. Store restricted artifacts in a controlled staging area. |
| Legal counsel before first sensitive publication | Mandatory. A sensitive finding waits for counsel even if the gate passes. |
| Takedown and threats | A named escalation path, preservation of evidence, and a corrections/retraction path. |

Current status: **hosting jurisdiction, legal structure, and counsel are not chosen**. This blocks
sensitive publication.

## 5. Review-queue handoff

The handoff from discovery to backend is explicit:

1. **Discovery:** a researcher records a lead, the source URL, the retrieval time, and the proposed
   predicate. Aggregator output stays in the lead record.
2. **Primary capture:** the researcher captures the official artifact, hashes it, and records the
   source and snapshot. No capture means no handoff.
3. **Draft:** a researcher creates the Relationship or Claim with scope, dates, unknowns, sensitivity,
   and evidence links. The draft is not public.
4. **Four-eyes:** a different reviewer assesses it. Self-assessment is forbidden. A `SUPPORTED`
   outcome needs the minimum evidence for the sensitivity.
5. **Gate:** a publisher runs the publication gate. A failed check blocks publication; a waiver is
   narrow, ADMIN-only, reasoned, and audited.
6. **Right of reply:** for SENSITIVE and HIGH_RISK, the organization is contacted and the deadline is
   recorded. A pending deadline blocks publication.
7. **Legal:** HIGH_RISK or any sensitive first publication waits for legal sign-off.
8. **Publish:** publication is audited. The public projection is allowlisted.
9. **Correct or retract:** a correction is a proposal, not an arbitrary patch. A retraction removes
   the finding from the document, read model, cache, and index within the SLO.

The queue is a human workflow. Do not encode a new canonical collection for it. Technical queue
state, if needed, belongs outside the eleven collections and needs an ADR.

## 6. Approval record

| Version | Date | Lead Researcher | Reviewer | Product/Engineering | Legal | Status |
|---|---|---|---|---|---|---|
| 0.1-draft | 2026-11-21 | Unassigned | Unassigned | Unassigned | Unassigned | Draft; not approved |

No section of this document is approved for publication. `methodologyVersion` must not point to this
draft.
