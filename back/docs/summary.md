# Ansoo Domain Summary

Condensed working summary of `../../CONSUMER_TRANSPARENCY_FINAL_ERD.md`. The ERD is authoritative; this
document exists so backend agents can load the domain quickly. If the two disagree, the ERD wins and this
summary must be corrected.

## Status

- **Scaffold only.** Directory structure, configuration, and documentation exist; no production models or
  actions are implemented.
- The ERD is the **proposed canonical baseline**. Validate it through
  `plans/01-architecture-spike.md` before production lock-in.
- Do not silently decide open questions in code. Record decisions and update this summary.

## Product in One Paragraph

A consumer scans or types a product identifier. Ansoo normalizes it according to its scheme, resolves one
exact Product when possible, and shows a profile with identity, accepted brand/category, related
organizations and time-aware relationships, published claims, evidence, source provenance, organization
responses, corrections, and explicit unknowns. Ambiguous, disputed, unverified, or not-found results are
valid outcomes. Ansoo never turns this into one opaque ethical, legal, or boycott score.

## Architecture

| Layer | Choice |
|---|---|
| Backend | Deno + Lesan 0.2.3 + MongoDB + djwt |
| Frontend | Next.js 16 + React 19 + TypeScript + Tailwind v4 + shadcn/base-ui + next-intl + Zustand + React Hook Form + Zod |
| Asset bytes | Object storage (local dev provider / S3-compatible production) |
| Asset metadata | `assets` collection |
| Search | MongoDB first; dedicated search engine only after measured need |

## Model Naming

The ERD uses canonical snake_case collection names. Backend folders currently use camelCase model names
(`sourceSnapshot`, `auditEvent`). Lesan's schema-name-to-collection-name behavior must be verified in the
spike. Do not hardcode a physical collection name or add a mapping layer before that decision.

## Core Collections

| Collection | Responsibility | Key fields | Fixed-schema relation |
|---|---|---|---|
| `products` | Exact trade item / packaging configuration a consumer can scan or search | `name`, `normalizedName`, `localizedNames[]`, `identifiers[]`, `brandMapping`, `packaging`, `attributes[]`, `lifecycle`, `mergedIntoProductId` | `brand` -> Brand (optional), `category` -> Category (optional) |
| `brands` | Market-facing brand identity | `name`, `normalizedName`, `localizedNames[]`, `aliases[]`, `website`, `logoAssetId`, `identityProvenance`, `lifecycle`, `mergedIntoBrandId` | Reverse `productsPreview` only |
| `categories` | Curated taxonomy for navigation/search/filtering | `code`, `name`, `localizedNames[]`, `parentCategoryId`, `ancestorIds[]`, `depth`, `sortOrder`, `taxonomyVersion`, `lifecycle` | Reverse `productsPreview` only |
| `organizations` | Corporate groups, legal entities, public bodies, non-profits, retailers | `name`, `localizedName(s)`, `kind`, `aliases[]`, `identifiers[]`, `legalProfile`, `operatingCountryCodes[]`, `identityProvenance`, `lifecycle`, `mergedIntoOrganizationId` | None |
| `relationships` | Directed, typed, scoped, time-aware graph edge | `subject`, `predicate`, `object`, `predicateRegistryVersion`, `context`, `validity`, `recordLifecycle`, `review`, `assessment`, `publication`, `evidence[]`, `organizationResponses[]`, `researchNotes[]`, `recentRevisionPreview[]`, `canonicalKey`, `recordedAt` | None (typed references) |
| `claims` | Research proposition not adequately represented by a typed edge | `about`, `relatedEntities[]`, `claimType`, `statement`, `localizedStatements[]`, `structuredValue`, `scope`, `recordLifecycle`, `review`, `assessment`, `publication`, `evidence[]`, `organizationResponses[]`, `researchNotes[]`, `recordedAt` | None (typed reference) |
| `sources` | Identity of an information source, not a capture | `title`, `canonicalUrl`, `sourceType`, `publisherName`, `publisherOrganizationId`, `language`, `countryCode`, `jurisdiction`, `access`, `usageTerms`, `lifecycle`, `lastCapturedAt` | Reverse `recentSnapshotsPreview` only |
| `source_snapshots` | Immutable capture of a Source at a point in time | `source`, `titleAtCapture`, `canonicalUrlAtCapture`, `publishedAt`, `retrievedAt`, `contentHash`, `hashAlgorithm`, `mimeType`, `byteSize`, `assetId`, `captureMethod`, `acquisitionTier`, `capturedBy`, `captureMetadata`, `lifecycle` | `source` -> Source (required) |
| `assets` | Metadata/lifecycle for bytes stored outside MongoDB | `storage {provider,bucket,objectKey}`, `originalFileName`, `safeDisplayName`, `mimeType`, `byteSize`, `sha256`, `processingStatus`, `visibility`, `uploadedBy`, `uploadedAt`, `malwareScan`, `lifecycle` | None |
| `corrections` | Submitted correction/completion/challenge/retraction/missing-entity proposal | `target?`, `submissionKind`, `proposedChange`, `reason`, `evidenceReferences[]`, `submittedBy`, `submittedAt`, `status`, `review`, `application` | None (typed reference) |
| `users` | Consumer/contributor and internal staff accounts | `authProvider`, `authSubject`, `email`, `phone`, `displayName`, `preferredLocale`, `roles[]`, `trustLevel`, `accountStatus`, `lastActiveAt` | None |
| `audit_events` | Append-only accountability stream | `eventSchemaVersion`, `actor {type,id}`, `action`, `target {type,id}`, `requestId`, `correlationId`, `targetVersionBefore/After`, `changedPaths[]`, `beforeSummary`, `afterSummary`, `reason`, `occurredAt` | None (typed reference) |

## Identity and Graph Boundaries

- **Product** is the exact trade item/packaging a consumer resolves. Identifiers are embedded
  `{scheme, value, normalizedValue, jurisdiction?, issuer?, status, sourceSnapshotIds?, validFrom?, validTo?}`.
  Values stay strings to preserve leading zeroes.
- **Brand** is a market-facing identity. Ownership, control, operation, manufacture, import, and
  distribution are Relationship edges, never mutable Brand fields.
- **Organization** is a corporate group, legal entity, public body, non-profit, retailer, etc. A group and
  its subsidiaries are separate Organization documents. Organization names are not identifiers.
- **Category** uses `parentCategoryId` + materialized `ancestorIds[]`. A domain service maintains the path,
  prevents cycles, and tests subtree moves. Product has one primary Category initially.
- **Relationship** is the central graph edge. Predicates are centrally defined:
  `OWNS`, `CONTROLS`, `SUBSIDIARY_OF`, `MANUFACTURES`, `DISTRIBUTES`, `IMPORTS_TO_MARKET`,
  `EXPORTS_TO_MARKET`, `SUPPLIES`, `OPERATES`. No arbitrary predicate strings or generic `OTHER` in
  published edges. `LICENSES`/`FRANCHISES` are deferred.
- **Claim** covers propositions that are not typed edges (`MARKET_PRESENCE`, `PRODUCT_ORIGIN`,
  `MANUFACTURING_LOCATION`, `CORPORATE_ACTIVITY`, `OFFICIAL_STATEMENT`, `PRODUCT_ATTRIBUTE`,
  `OTHER_REVIEWED_TYPE`). `about` is exactly one subject; `relatedEntities` is a small contextual list,
  not a second graph.
- **Source** is an identity. **SourceSnapshot** is an immutable capture with hash, retrieval time, capture
  method, and Asset. A changed source creates a new Snapshot; never overwrite the captured bytes.
- **EvidenceLink** is contextual to its parent edge/claim: `sourceSnapshotId`, `stance`
  (`SUPPORTS`/`CONTRADICTS`/`CONTEXTUALIZES`/`NEUTRAL`), locator, excerpt, rationale, reviewer.
- **OrganizationResponse** is an attributed party position, not a research verdict. Respondent identity
  and representative authority are separate checks.
- **Correction** is a proposal. Approval is not application. Application uses an allowlisted domain
  action with expected-version check, idempotency, and Audit Event.

## Valid Time vs Recorded Time

- `validity.validFrom`/`validTo` answer: when was this true in the real world?
- `recordedAt`, `createdAt`, `updatedAt` answer: when did the platform learn/store it?
- Use `[validFrom, validTo)`; unknown dates remain `null`. `validTo: null` means no recorded end date, not
  proof that the statement is current.
- Store all dates as UTC BSON `Date`; localize display only.

## Status Domains (Never Collapse)

| Dimension | Question | Values |
|---|---|---|
| `recordLifecycle` | Is the platform record active or archived? | `ACTIVE`, `ARCHIVED` |
| `review.status` | What work is currently happening? | `NOT_QUEUED`, `QUEUED`, `IN_REVIEW`, `NEEDS_INFORMATION`, `READY_FOR_DECISION`, `CLOSED` |
| `assessment.outcome` | What does reviewed evidence support? | `NOT_ASSESSED`, `SUPPORTED`, `PARTIALLY_SUPPORTED`, `NOT_SUPPORTED`, `DISPUTED`, `INCONCLUSIVE` |
| `publication.status` | Is it publicly visible? | `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `WITHHELD`, `RETRACTED` |
| Future legal assessment | What legal conclusion applies under a named instrument/jurisdiction/date? | Separate future vocabulary |
| Future campaign state | Is it in a defined campaign and in what state? | Separate future vocabulary |

`SUPPORTED` does not imply `PUBLISHED`. `NOT_SUPPORTED` does not mean `FALSE`. `DISPUTED` is not "a user
disagrees". A published finding can be `RETRACTED` without deleting history.

## Shared Embedded Contracts

| Contract | Embedded in | Purpose |
|---|---|---|
| `EvidenceLink` | Relationship, Claim | Evidence stance, locator, excerpt, rationale, review metadata |
| `ReviewWorkflow` | Relationship, Claim | Review queue/work state, assignee, priority, timestamps |
| `EvidenceAssessment` | Relationship, Claim | Current evidence conclusion, summary, assessor, methodology, limitations |
| `PublicationState` | Relationship, Claim | Public visibility decision, decider, dates, reason, visibility scope |
| `OrganizationResponse` | Relationship, Claim | Attributed organization position, verification, attachment refs, publication state |
| `ResearchNote` | Relationship, Claim | Private internal/legal/admin note |
| `RevisionPreview` | Relationship | Short recent-change preview, not the audit history |

These are bounded. Split into separate collections only when volume, independent moderation/search,
threading, or retention rules justify it.

## Lesan Relation Boundaries

Approved fixed-schema Lesan relations:

1. `Product.brand` -> Brand (optional). Reverse `Brand.productsPreview` is a limited preview.
2. `Product.category` -> Category (optional). Reverse `Category.productsPreview` is a limited preview.
3. `SourceSnapshot.source` -> Source (required). Reverse `Source.recentSnapshotsPreview` is a limited preview.

Use ordinary typed references, validated by a server-controlled registry, for:

- `Relationship.subject` / `.object`
- `Claim.about` / `.relatedEntities`
- `Correction.target`
- `AuditEvent.target`
- `EvidenceLink.sourceSnapshotId`
- `OrganizationResponse.respondingOrganizationId`
- Asset references from snapshots, corrections, and responses
- User attribution fields where no fixed reverse preview is needed

Never treat a limited reverse array as the authoritative list, count, export, or research corpus. Query the
owning collection with pagination and filters.

## Product Lookup Flow

```text
scanned code / manual identifier
  -> normalize by scheme
  -> resolve exact Product by scheme + value + scope
  -> one verified match: Product profile
     OR no/ambiguous/disputed: explicit resolution state + manual search/correction
  -> brand + category
  -> related organizations + relationships
  -> published claims + evidence + sources
  -> legal/campaign/alternatives modules only when reviewed and available
```

Valid outcomes include `NOT_FOUND`, `AMBIGUOUS`, `DISPUTED`, `UNVERIFIED`. Do not force a match.

## Public Product Profile

Show separately:

1. Product identity and public identifiers.
2. Brand mapping state and accepted brand/category (or explicit unverified state).
3. Relationships with predicate, market, validity, and evidence state.
4. Published claims with exact wording, scope, assessment, and publication state.
5. Evidence/source citations with capture dates and access limitations.
6. Organization responses, attributed.
7. Unknowns, conflicts, and limitations.
8. Future legal/campaign modules only when a reviewed module exists.

Never show a universal verdict. Never infer legal prohibition from a corporate relationship, barcode, or
graph path.

## Query Patterns the Model Must Support

1. Resolve a GTIN/other identifier to one exact Product.
2. Return a Product with accepted Brand/Category snapshots.
3. Paginate Products by Brand/Category with filters.
4. Outgoing Relationships from an Organization/Brand/Product.
5. Incoming Relationships to an Organization/Brand/Product.
6. Timeline of ownership/control/manufacturing/import/distribution edges.
7. Published Relationships/Claims about a target.
8. Evidence and provenance for one finding.
9. Organization responses in context.
10. Research queue: queued/in-review Claims, Relationships, Corrections.
11. Corrections by submitter/target/status/date.
12. Every Snapshot for a Source, newest first.
13. Audit Events by target/actor.
14. Counts by review status, assessment, publication, predicate, market, date.
15. Detect overlapping/conflicting Relationships without treating missing data as a negative conclusion.

## Index Candidates (Validate Before Creating)

- Products: `normalizedName`; identifiers `(scheme, normalizedValue, jurisdiction)`; `(brand._id,
  lifecycle)`; `(category._id, lifecycle)`.
- Brands: `normalizedName`; `aliases.normalizedValue`; `(lifecycle, updatedAt desc)`.
- Categories: `code` (unique only after policy); `(parentCategoryId, sortOrder)`; `ancestorIds`.
- Organizations: `normalizedName`; identifiers composite; `(kind, lifecycle)`;
  `(operatingCountryCodes, kind)`.
- Relationships: `(subject.type, subject.id, predicate, recordLifecycle)`;
  `(object.type, object.id, predicate, recordLifecycle)`;
  `(review.status, updatedAt desc)` for the global queue and
  `(review.status, review.assignedTo, updatedAt desc)` for an assignee queue;
  `(assessment.outcome, updatedAt desc)`; `(publication.status, updatedAt desc)`;
  `(context.marketCountryCode, predicate, recordLifecycle)`.
- Claims: same split review-queue, assessment, and publication patterns;
  `(about.type, about.id, claimType, recordLifecycle)`; `(scope.marketCountryCode, claimType)`.
- Sources/Snapshots: `canonicalUrl`; `(sourceType, lifecycle)`; `(source._id, retrievedAt desc)`;
  `contentHash`.
- Corrections: `(status, submittedAt desc)`; `(submittedBy, submittedAt desc)`;
  `(target.type, target.id, status)`; `(review.assignedTo, status, submittedAt desc)`.
- Audit Events: `(target.type, target.id, occurredAt desc)`;
  `(actor.type, actor.id, occurredAt desc)`; `requestId`.

Rules: verify with `explain()`, respect multikey/compound-array restrictions, do not assume a unique
multikey index prevents duplicates within one document, and postpone uniqueness until identifier scope and
real duplicates are understood. A compound queue index with an unconstrained middle key cannot serve the
global `status + sort(date)` query; keep the global and assignee queue indexes separate. See
`reports/01-architecture-spike.md` Section 5.

## Data Integrity, Privacy, and Assets

- Public projections are explicit allowlists. Research notes, unreviewed submissions, restricted sources,
  private user fields, internal roles, private asset keys, and security metadata never leak.
- Asset bytes live in object storage; MongoDB stores metadata/hash/visibility/processing only. Validate MIME
  from bytes, enforce allowlists, quarantine until scanned, strip personal metadata, and serve short-lived
  authorized URLs.
- URL fetching is SSRF-sensitive: HTTPS by default, block private/link-local/reserved/metadata addresses,
  revalidate redirects and DNS, cap redirects/time/body, and send no ambient credentials.
- Audit Events are append-only and redacted. Corrections are proposals, not direct edits.
- Barcode/GS1 prefixes must not infer manufacturing country, ownership, nationality, or legal/ethical
  status.

## Initial Scope vs Future

**Core now:** Products, Brands, Categories, Organizations, Relationships, Claims, Sources, Snapshots,
Assets, Evidence/Responses embedded, review/assessment/publication, Corrections, Users, Audit Events.

**Future, reviewed modules:** `legal_instruments` + `legal_assessments`, `product_alternatives`,
`market_observations`, `campaigns` + `campaign_targets`, `information_requests`, dedicated evidence registry
only if justified, derived search/dashboard read models.

## Architecture Spike Decisions (2026-11-15)

The spike proved the baseline on Deno 2.4.5, Lesan 0.2.3, and MongoDB 8.0.13. Full evidence, latency,
`explain` plans, BSON measurements, security negative tests, and the first production slice are in
`reports/01-architecture-spike.md`.

| Decision | Result | Follow-up |
|---|---|---|
| Schema/collection naming | Exact canonical snake_case Lesan schema names; no mapping layer | Keep names stable in production models |
| Relation snapshots | Embedded pure child fields + `_id`; internal fields excluded; `{}` means no relation | Treat `{}`/missing `_id` as absent |
| Reverse previews | Bounded previews only; never counts or authoritative lists | Name reverse fields `*Preview` |
| Relation updates | `replace: true` updates both sides; removal leaves `{}`; no re-add without replace | Use audited domain actions only |
| Deletion | No `hardCascade`; delete children first; dependents block parent deletion | Archive by default |
| Type generation | `ReqType` and per-model schemas/types generated and consumed by the frontend | Regenerate from production models |
| Concurrency | Expected version + atomic version bump; stale writes fail | Add unique idempotency ledger before write-heavy corrections |
| Indexes | Eight core query shapes verified with no collection scan | Re-verify on production-like data |
| Reference registry | Only server-controlled `{type, id}` with per-field endpoint allowlists | Enforce on every read/write |
| Snapshot immutability | Content identity is not correctable; changed content is a new snapshot | Enforce service + DB privileges |
| Audit | Append-only service API with redaction; request grouping | Deny update/delete at DB role level |
| Corrections | Approval separate from application; allowlisted, versioned, idempotent, audited | Prove concurrent double-apply with a transaction/ledger |
| Auth | DB-derived roles, token claims ignored, guests public-only, header `token` without `Bearer` | Wire into Lesan pre-acts and test HTTP path |
| Assets | Bytes outside Mongo; quarantine, MIME sniffing, EXIF stripping, signed URLs | Use object storage and a maintained scanner |
| SSRF | HTTPS/443 only; private/reserved blocks; DNS/redirect revalidation; caps | Pin resolved IP at connect time |
| Identifiers | Exact check-digit normalization; strings preserved; explicit outcomes; no GS1 inference | Confirm first schemes/issuers |
| Search | Normalized prefix search only; no fuzzy matching in MVP | Add measured read model later |
| BSON | Representative 23.8 KB; cap evidence at 500 links (~0.55 MB); split before 1 MiB | Revisit with real data |

Recommendation: **go, with constraints, for a read-only identity/profile slice**. Do not start write-heavy
research workflows until the policy questions below have owners and recorded answers.

## Open Questions Blocking Production Lock-In

1. Can a trade item have more than one primary Brand in target markets?
2. Is one primary Category sufficient; how are secondary memberships represented?
3. Which identifier schemes are required first, and who issues each?
4. Exact canonical meaning, inverse wording, and endpoint types for every Relationship predicate?
5. Are overlapping same-predicate edges allowed when sources/markets differ?
6. Minimum evidence before a Claim/Relationship may be assessed `SUPPORTED`?
7. Who may assess evidence, and who may publish/retract?
8. Can one review cover multiple findings (justifying a review-case aggregate)?
9. Practical per-parent evidence/response/note limits?
10. Asset public/internal/restricted/redacted policy and retention?
11. Localization strategy and canonical-vs-translated field policy for fa/en/ar and beyond?
12. Which official Iranian identifier sources are reliably and legally accessible first?
13. Source authority/capture rules without a universal reliability score?
14. Approved public wording for each assessment outcome?
15. Legal review required before sensitive claims about organizations/individuals?

Disposition: technical questions are answered in `reports/01-architecture-spike.md` Section 4. Questions
1-8, 10-15 remain blocked on product, research, editorial, legal, or sourcing owners; do not encode a silent
default for them.

## Scaffold and Next Step

- Backend scaffold: model/action folders, `deno.json`, env example, registry placeholders, docs.
- Frontend scaffold: route groups, action folders, component/i18n/store/type folders, configs, env example.
- No production code. The architecture spike is complete with constraints; see
  `reports/01-architecture-spike.md`. Next step: implement the read-only identity/profile slice and resolve
  the blocked policy questions before write-heavy workflows.
