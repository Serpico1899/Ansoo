# Ansoo Domain Summary (v3.1)

Condensed working summary of `../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` (CT-DOMAIN-SPEC v3.1).
The spec is authoritative; this document exists so backend agents can load the domain quickly. If the two
disagree, the spec wins and this summary must be corrected.

## Status

- **Models, domain services, and authenticated HTTP actions implemented.** The eleven v3.1 models,
  embedded contracts, cap validators, two Lesan relations, starting indexes, identity, research,
  provenance, governance, auth, projections, and the dispatcher exist. Plan 09 owns final profile assembly.
- **Plan 08 complete (2026-11-19).** JWT auth with DB-derived roles, the capability matrix, the stable error
  envelope, Public/Research/Admin projections, the I04 role x field matrix, and the generated frontend
  contract are in place.
- **Plan 07 complete (2026-11-18).** Append-only audit with per-action allowlists, correction
  submission/review/transactional application, user roles/trust/status/PII purge, and legal-hold-aware
  asset retention are in place.
- **Plan 06 complete (2026-11-18).** Source identity, immutable snapshots, redaction lineage, asset
  quarantine/visibility, signed delivery, SSRF-safe fetching, and evidence links are in place.
- **Plan 05 complete (2026-11-18).** Relationship edges, three claim types, independent status machines,
  sensitivity/evidence rules, assessment, publication gates, right of reply, responses, and retraction are
  in place.
- **Plan 04 complete (2026-11-17).** Persian normalization, GTIN identifiers, URL canonicalization, the
  closed reference registry, merge/unmerge, resolution, brand mapping, and MVP search are in place.
- **Plan 03 complete (2026-11-17).** Eleven collections, shared contracts, cap enforcement, relation
  boundaries, and verified indexes are in place.
- **Plan 02 complete (2026-11-16).** Shared v3.1 vocabulary/caps, invariant harness, replica-set dev
  topology, fail-fast config, and archived spike are in place.
- v3.1 is the **single canonical baseline**. It supersedes v1.0, v2.0, and the old
  `CONSUMER_TRANSPARENCY_FINAL_ERD.md` as domain authority. See
  `adr/0001-v3.1-single-canonical-spec.md`.
- The architecture spike (plan 01) is complete against the superseded draft. Its Lesan/MongoDB mechanics and
  evidence remain valid; its category, predicate, claim-type, and relation decisions do not.
- Do not silently decide open questions in code. Record decisions in `adr/` and update this summary.

## Product in One Paragraph

A consumer scans or types a product identifier. Ansoo normalizes it per scheme, resolves one exact Product
when possible, and shows a profile with identity, brand-mapping state, published relationships and claims,
evidence, source provenance, organization responses, corrections, limitations, and explicit unknowns.
Ambiguous, disputed, unverified, or not-found results are valid outcomes. Ansoo never produces a single
opaque ethical, legal, or boycott score.

## Architecture

| Layer | Choice |
|---|---|
| Backend | Deno + Lesan 0.2.3 + MongoDB + djwt |
| Frontend | Next.js 16 + React 19 + TypeScript + Tailwind v4 + shadcn/base-ui + next-intl + Zustand + RHF + Zod |
| Asset bytes | Object storage (local dev provider / S3-compatible production) |
| Asset metadata | `assets` collection only |
| Search | Exact `matchKey` + prefix on `normalizedName`; no fuzzy Persian promise in MVP |
| Read model | `product_public_profiles` (technical, rebuildable, not a domain source of truth) |

## The Eleven Collections (LOCKED)

| Collection | Responsibility | Fixed-schema relation |
|---|---|---|
| `products` | Exact trade item/packaging configuration a consumer resolves | `brand` -> Brand (optional) |
| `brands` | Market-facing brand identity; no owner field | Reverse `productsPreview` (bounded) |
| `organizations` | Corporate groups, legal entities, public bodies, non-profits, retailers | none |
| `relationships` | Directed, typed, scoped, time-aware graph edge | none (typed references) |
| `claims` | Research proposition not adequately represented by an edge | none (typed references) |
| `sources` | Identity of an information source, not a capture | Reverse `recentSnapshotsPreview` (bounded) |
| `source_snapshots` | Immutable capture of a Source at a point in time | `source` -> Source (required) |
| `assets` | Metadata/lifecycle for bytes stored outside MongoDB | none |
| `corrections` | Submitted correction/completion/retraction proposal | none |
| `users` | Account data and authorization roles; all PII lives here | none |
| `audit_events` | Append-only accountability stream | none |

`categories` is **DEFERRED**. Product stores `categoryCode` validated against `taxonomy.v1.json`. There is no
Category model and no `Product.category` relation.

## Non-Negotiable Invariants

| ID | Rule |
|---|---|
| I01 | Product != Brand != Organization; Importer is a role, not an identity |
| I02 | `UNKNOWN != FALSE`; `NOT_SUPPORTED` is not the negation of the proposition |
| I03 | review != assessment != publication != legal != campaign; no combined badge |
| I04 | Public projections never return internal data |
| I05 | `SUPPORTED` requires >=1 EvidenceLink and `assessedBy != createdBy` |
| I06 | `PUBLISHED` requires `publicationGate.result = PASS` |
| I07 | SENSITIVE/HIGH_RISK: author != assessor != publisher |
| I08 | SourceSnapshot content identity is immutable |
| I09 | AuditEvent is append-only |
| I10 | Correction never applies a raw patch |
| I11 | No transitive ownership/control inference without written methodology |
| I12 | No universal score, color, or badge |
| I13 | All identifiers are strings; leading zeros preserved |
| I14 | Array caps enforced in validators; exceed -> 422, never silent discard |
| I15 | Merge = tombstone + redirect; historical references never rewritten |

Each invariant has an executable test named after its ID.

## Identity and Graph Boundaries

- **Product** is the exact trade item/packaging a consumer resolves. Identifiers are embedded
  `{scheme, value, normalizedValue, matchValue?, jurisdiction?, issuer?, status, sourceSnapshotIds?,
  validFrom?, validTo?}`. Values stay strings to preserve leading zeros. A 200 g jar and a 500 g jar with
  different GTINs are different Products.
- **Brand** is a market-facing identity. Ownership, control, manufacture, import, and distribution are
  Relationship edges, never mutable Brand fields.
- **Organization** is a corporate group, legal entity, public body, non-profit, or retailer. A group and its
  subsidiaries are separate Organization documents; their connection is a Relationship. Importer,
  manufacturer, and distributor are roles, not identity types.
- **Relationship** is a directed `{subject, predicate, object}` edge. Five predicates only:

  | Predicate | Subject | Object | Required context |
  |---|---|---|---|
  | `OWNS` | ORGANIZATION | ORGANIZATION or BRAND | share/basis when documented |
  | `CONTROLS` | ORGANIZATION | ORGANIZATION or BRAND | `ownership.basis` |
  | `MANUFACTURES` | ORGANIZATION | PRODUCT | - |
  | `DISTRIBUTES` | ORGANIZATION | PRODUCT or BRAND | `marketCountryCode` |
  | `IMPORTS_TO_MARKET` | ORGANIZATION | PRODUCT | `marketCountryCode` |

  `SUBSIDIARY_OF` does not exist; "subsidiary of" is a derived read-time label. Owner change = a new edge,
  never a rewrite. Overlap is a review flag, never a rejection. `canonicalKey` is for idempotency/duplicate
  suggestions only; a unique index on it is forbidden until a written domain decision.
- **Claim** is exactly one of `MARKET_PRESENCE`, `PRODUCT_ORIGIN`, `OFFICIAL_STATEMENT`, with a discriminated
  `structuredValue`. Any other type is rejected. If a claim takes the shape of a permitted edge, return
  `409 USE_RELATIONSHIP_INSTEAD`.
- **Source** is an identity. **SourceSnapshot** is an immutable capture with hash, retrieval time, capture
  method, and Asset. A changed source creates a new Snapshot; never overwrite captured bytes. A metadata
  correction creates a new snapshot with `supersedesSnapshotId`.
- **EvidenceLink** is contextual to its parent edge/claim: `sourceSnapshotId`, `stance`, locator, excerpt,
  rationale, reviewer. Stance belongs to the link, not the Source.
- **OrganizationResponse** is an attributed party position, not a research verdict. Respondent identity and
  representative authority are separate checks. `ResponseSolicitation` proves the right of reply.
- **Correction** is a proposal. Approval is not application. Application uses an allowlisted domain action
  with expected-version check, idempotency, and an Audit Event.

## Time

- `validity.validFrom`/`validTo` answer: when was this true in the real world? Half-open `[from, to)`.
- `recordedAt`, `createdAt`, `updatedAt` answer: when did the platform learn/store it?
- Unknown dates stay `null`; never invent precision. `validTo: null` means "no end recorded", not "still
  true today". Public display must state the difference.
- Store all dates as UTC BSON `Date`; Jalali conversion happens in the UI only.

## Status Domains (Never Collapse)

| Dimension | Question | Values |
|---|---|---|
| `recordLifecycle` | Is the platform record active? | `ACTIVE`, `INACTIVE`, `ARCHIVED`, `MERGED` |
| `validity` | When was it true in the world? | `validFrom` / `validTo` |
| `review.status` | What work is happening? | `NOT_QUEUED`, `QUEUED`, `IN_REVIEW`, `NEEDS_INFORMATION`, `READY_FOR_DECISION`, `CLOSED` |
| `assessment.outcome` | What does reviewed evidence support? | `NOT_ASSESSED`, `SUPPORTED`, `PARTIALLY_SUPPORTED`, `NOT_SUPPORTED`, `DISPUTED`, `INCONCLUSIVE` |
| `publication.status` | Is it publicly visible? | `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `WITHHELD`, `RETRACTED` |
| Legal (DEFERRED) | Which law, jurisdiction, date? | Separate future vocabulary |
| Campaign (DEFERRED) | Which campaign and whose criteria? | Separate future vocabulary |

`SUPPORTED` does not imply `PUBLISHED`. `NOT_SUPPORTED` does not mean `FALSE`. `DISPUTED` is not "a user
disagrees". `SUPPORTED + WITHHELD` is a valid, correct combination.

## Shared Embedded Contracts

| Contract | Embedded in | Purpose |
|---|---|---|
| `EvidenceLink` | Relationship, Claim | Evidence stance, locator, excerpt, rationale, review metadata |
| `ReviewWorkflow` | Relationship, Claim | Queue/work state, assignee, priority, timestamps |
| `EvidenceAssessment` | Relationship, Claim | Current conclusion, summary, assessor, methodology, limitations |
| `PublicationState` | Relationship, Claim | Visibility decision, decider, dates, reason |
| `PublicationGate` | Relationship, Claim | Gate version, checks, result, failures, waivers |
| `ResponseSolicitation` | Relationship, Claim | Right-of-reply proof: channel, sent date, deadline, outcome, proof asset |
| `OrganizationResponse` | Relationship, Claim | Attributed party position, verification, attachments, publication state |
| `ResearchNote` | Relationship, Claim | Private internal/legal/admin note; never public |
| `RevisionPreview` | Relationship, Claim | Short recent-change preview, not the audit history |

## Hard Caps (Enforced in Validators)

| Path | Cap |
|---|---|
| `identifiers[]` | 20 |
| `aliases[]` | 50 |
| `localizedNames[]` | 10 |
| `attributes[]` | 40 |
| `evidence[]` | 50 |
| `organizationResponses[]` | 20 |
| `responseSolicitations[]` | 10 |
| `researchNotes[]` | 100 |
| `recentRevisionPreview[]` | 20 |
| `relatedEntities[]` / `evidenceReferences[]` | 10 |
| `excerpt` / `statement` / `publicWording` / `rationale` | 2,000 chars |
| `responseText` | 10,000 chars |
| `noteBody` | 4,000 chars |
| `captureMetadata` | 20 allowlisted keys, depth <= 2 |

Exceeding a cap -> `422 CAP_EXCEEDED`. Never silent `$slice`. Real growth requires an ADR for a split.

## Lesan Boundaries

Exactly two relations:

1. `Product.brand` -> Brand (single, optional). Reverse `Brand.productsPreview` (multiple, limit 20, sort
   `updatedAt` desc).
2. `SourceSnapshot.source` -> Source (single, required). Reverse `Source.recentSnapshotsPreview` (multiple,
   limit 10, sort `retrievedAt` desc).

Everything else is a plain typed reference validated by a server-side registry:

`Relationship.subject/object`, `Claim.about/relatedEntities`, `Correction.target`, `AuditEvent.target`,
`EvidenceLink.sourceSnapshotId`, `OrganizationResponse.respondingOrganizationId`, all `assetId`, all User
references.

Reverse previews are bounded windows, never authoritative lists, counts, exports, or research corpora. Query
the owning collection. Never raw-update embedded relation snapshots; use `updateRelations` or a domain
action. Do not enable `hardCascade`.

## Product Lookup and Resolution

```text
scanned code / manual identifier
  -> normalize per scheme
  -> resolve exact Product by scheme + value + scope
  -> FOUND | NOT_FOUND | AMBIGUOUS | DISPUTED | UNVERIFIED
  -> brand mapping state + brand
  -> published Product/Brand-level relationships and claims (max 2 hops)
  -> evidence + source + dates + limitations + responses + unknowns
```

Never return an arbitrary match. `NOT_FOUND` is a valid and useful answer. GS1 prefixes and barcode
allocation never infer manufacturing country, nationality, ownership, or legal/ethical status.

## Normalization

Persian name normalization produces two keys:

- `normalizedName`: NFKC, remove harakat/tatweel, fold Arabic Yeh/Alef Maksura/Kaf, fold Persian/Arabic
  digits, ZWNJ and Unicode separators to space, collapse whitespace, lowercase Latin.
- `matchKey`: `normalizedName` plus fold Teh Marbuta to Heh, Alef variants to Alef, Waw variants, Yeh
  variants, remove Hamza and all whitespace/punctuation.

Mandatory vectors include `شركت پگاه ايران` -> `شرکت پگاه ایران` / `شرکتپگاهایران`, `کاله ۱۲۳` ->
`کاله 123` / `کاله123`, and `دامدارانِ` -> `دامداران`.

`matchKey` is for candidate retrieval only. Merging two identities is never automatic. Identifier values are
normalized per scheme; never compare values across schemes; a unique identifier index is forbidden until
domain uniqueness is proven.

## Merge and Redirect

A merge is tombstone + redirect. Historical references are never rewritten. `entityResolver.resolve(ref)`
follows `mergedIntoId` max depth 5 with cycle detection; a cycle is an error and an admin flag. Public reads
redirect to the survivor with a notice. Unmerge is possible via AuditEvent + lifecycle restoration. Merging
conflicting official identifiers is blocked for human decision.

## Governance and Publication

- `sensitivity`: `ROUTINE`, `SENSITIVE`, `HIGH_RISK`. It is a publication-risk classification, not a moral or
  legal judgment.
- Minimum evidence: ROUTINE 1 verified snapshot; SENSITIVE 2 independent sources or 1 official registry
  snapshot (Tier A/B); HIGH_RISK 2 independent sources including >=1 official, four-eyes + LEGAL_REVIEWER.
- `SUPPORTED` requires >=1 EvidenceLink and `assessedBy != createdBy` (I05).
- Four-eyes for SENSITIVE/HIGH_RISK: author != assessor != publisher (I07).
- `PUBLISHED` requires `publicationGate.result = PASS` (I06). Gate checks: evidence count, independent
  sources, assessment, four-eyes, legal sign-off, right of reply, public wording, source access, no score.
- Waivers only for `rightOfReplyOk` and `independentSourcesOk`, only by ADMIN, with written reason and an
  AuditEvent. `fourEyesOk` and `legalSignOffOk` can never be waived.
- Right of reply: `ResponseSolicitation` with channel, `sentAt`, `assertionsSummary`, `responseDeadline`
  (default +14 days), outcome, proof asset. SENSITIVE publication is blocked until a response arrives or the
  deadline elapses.
- `researchNotes` never appear in a public projection under any role (I04).

## Public Profile Assembly

- Product-level finding: displayed directly, `scope: "PRODUCT"`.
- Brand-level finding: displayed on all Products of that Brand with `scope: "BRAND"` and `inheritedFrom`;
  the scope label is visible.
- Organization-level finding: only through a **published** edge in the chain Product -> Brand -> Org.
- Maximum depth 2 hops. No automatic multi-hop traversal for ultimate-ownership conclusions (I11).
- Output includes resolution, product identity, brand, findings, explicit unknowns, and
  `noUniversalScore: true`.
- Each finding includes public wording, counterparties, validity, assessment outcome, limitations, evidence,
  organization responses, right-of-reply state, and correction notice.
- `PublicCorrectionNotice` is displayed when previously published wording is corrected or retracted.
- Read model `product_public_profiles` is keyed by `productId`, carries `sourceVersions`, is rebuilt on
  publication/evidence/merge/brand-relation/retraction changes, is fully rebuildable (S30), and targets p95
  profile read < 400 ms.
- Retraction is synchronous across document, read model, cache/CDN, and search index; p95 < 60 s (S24).

## Concurrency and Integrity

| Operation | Strategy |
|---|---|
| Identity field edit | CAS on `version` |
| review/assessment/publication transition | CAS + state-machine guard |
| Append evidence/response/note/solicitation | Commutative append with cap guard; no CAS |
| Removal from an array | CAS |
| Merge | CAS + transaction/outbox |
| Apply correction | CAS on target + `idempotencyKey` |

Append guards use `$expr` + `$size` cap checks; `matchedCount === 0` means `422 CAP_EXCEEDED`. CAS uses
`{_id, version: expectedVersion}` and `$inc` on `version` only (never on a Date); `matchedCount === 0` means
`409 CONFLICT`. Patches never contain `version`, `_id`, `createdAt`, or `createdBy`.

Run dev MongoDB as a single-node replica set so transaction behavior matches production. Do not use
transactions everywhere. Non-atomic multi-document operations use Outbox + idempotency + repair job. Never
assume Lesan sync equals a transaction. Failure-injection mid-operation is mandatory (S17).

## Query and Index Baseline

Starting indexes (validate with `explain("executionStats")`, do not create blindly):

```
products:      { "identifiers.scheme":1, "identifiers.normalizedValue":1, "identifiers.jurisdiction":1 }
               { "identifiers.matchValue":1 } / { matchKey:1 }
               { "brand._id":1, lifecycle:1 } / { categoryCode:1, lifecycle:1 }
brands:        { matchKey:1 } / { "aliases.matchKey":1 } / { lifecycle:1, updatedAt:-1 }
organizations: { matchKey:1 }
               { "identifiers.scheme":1, "identifiers.normalizedValue":1, "identifiers.jurisdiction":1 }
               { kind:1, lifecycle:1 }
relationships: { "subject.type":1, "subject.id":1, predicate:1, recordLifecycle:1 }
               { "object.type":1, "object.id":1, predicate:1, recordLifecycle:1 }
               { "review.status":1, "review.assignedTo":1, updatedAt:-1 }
               { "publication.status":1, updatedAt:-1 }
               { "context.marketCountryCode":1, predicate:1, recordLifecycle:1 }
claims:        { "about.type":1, "about.id":1, claimType:1, recordLifecycle:1 }
               { "review.status":1, "review.assignedTo":1, updatedAt:-1 }
               { "publication.status":1, updatedAt:-1 }
sources:       { canonicalUrl:1 } / { sourceType:1, lifecycle:1 }
snapshots:     { "source._id":1, retrievedAt:-1 } / { contentHash:1 }
corrections:   { status:1, submittedAt:-1 } / { submittedBy:1, submittedAt:-1 }
               { "target.type":1, "target.id":1, status:1 }
               { "application.idempotencyKey":1 } unique sparse
audit_events:  { "target.type":1, "target.id":1, occurredAt:-1 }
               { "actor.type":1, "actor.id":1, occurredAt:-1 } / { correlationId:1 }
profiles:      { productId:1 } unique
```

A unique multikey index does not prevent duplicates within one document; control intra-document duplicates
in the service. A compound index over two independent arrays is forbidden. Queue indexes must be split:
global `{status, updatedAt}` and assignee `{status, assignedTo, updatedAt}`.

## Security, Privacy, Assets, Retention

- Projections: Public / Research / Admin, enforced server-side. `selectStruct` types output, never grants
  access.
- Fetcher: HTTPS only; block private, link-local, reserved, loopback, and cloud-metadata ranges; revalidate
  after every redirect and DNS resolution; max 3 redirects, 10 seconds, 10 MiB; no ambient credentials.
- Abuse: corrections 10/day/user and 30/day/IP; uploads 5/day and 20 MiB; content-hash dedup; coordinated
  dispute floods flagged to MODERATOR. `trustLevel` is not a rate limiter.
- Retention: PII only in `users`. Account deletion purges PII and preserves `actor.id` in Audit. Assets in
  `DELETED_PENDING_PURGE` purged after `retentionUntil` unless `legalHold`. Backups: PITR + object
  versioning; monthly restore test.
- Assets: bytes outside MongoDB; MIME sniffed from bytes; quarantine until scanning; EXIF stripped; signed
  short-lived URLs; object keys never reach clients.

## Data Acquisition and Research Operations

- Acquisition is equal priority to engineering. Verified tooling: `iran-mcp` (77 MCP servers, MIT).
- Aggregator = discovery only (`E_RESEARCH_OR_COMMUNITY`); primary source artifact = evidence
  (`A_OFFICIAL_MACHINE_READABLE`, `B_OFFICIAL_PUBLIC_LOOKUP`, `C_OFFICIAL_AUTHENTICATED_ACCESS`,
  `D_FORMAL_INFORMATION_REQUEST`).
- Do not rebuild Rasmio; subscribe to its identity layer. Do not circumvent caps or republish derived
  datasets. Codal may require Iranian infrastructure and paced requests.
- Pipeline: discover owner -> find official notice/filing -> capture bytes as Asset + Snapshot + hash ->
  create a Relationship with evidence/validity/sensitivity -> four-eyes + gate + right of reply -> publish.
- GTIN coverage is incomplete; the scanner is the catalog factory. `NOT_FOUND` becomes a contribution.
  Seed 30 high-turnover brands in one category so early scans are not empty.
- Numeric targets: 100 Products, 20 Brands, 20 defensible ownership/import edges; record researcher-minutes
  per edge. Go/No-Go: average routine edge > 60 minutes means redesign economics, not schema.
- Mandatory public artifacts: `methodology.md`, funding/independence policy, symmetric evidence standards.
  Legal counsel before the first sensitive publication.

## Scope

**Core now:** 11 collections, 2 relations, 5 predicates, 3 claim types, 15 invariants, status separation,
sensitivity + gate + right of reply, merge/redirect, public profile + read model, audit + corrections,
assets + SSRF-safe capture, auth/projections, data acquisition + research operations.

**Deferred:** `categories` collection, `SUBSIDIARY_OF`, `OPERATES`, `SUPPLIES`, `EXPORTS_TO_MARKET`,
`LICENSES`, `FRANCHISES`, extra claim types, legal instruments/assessments, campaigns, product alternatives,
market observations, information requests, dedicated search engine, and any universal score.

## Genuinely Open Decisions (Spec Section 22)

1. Is co-branding real in the target market?
2. Which identifier schemes are obtainable in the first categories?
3. Can a unique identifier index be applied after real data is observed?
4. Does the shared review queue across Relationship/Claim/Correction need a read model?
5. Transactions or Outbox, based on the real deployment?
6. Exact asset retention policy.

These must not be silently answered. Write an ADR or record the decision as blocked with an owner.

## Documentation Map

- `plans/00-roadmap.md` - delivery sequence and gates.
- `plans/02-11` - executable backend plans.
- `prompts/02-11` - matching agent prompts.
- `adr/` - accepted decisions.
- `reports/` - completed evidence.
- `methodology.md` - draft public methodology (owner: research/editorial/legal).
