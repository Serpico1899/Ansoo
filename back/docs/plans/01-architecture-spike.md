# Plan 01 - Architecture Spike

> **Historical note (2026-11-16):** This plan was executed against the superseded v1/v2 draft. CT-DOMAIN-SPEC
> v3.1 is now canonical (`../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`). The Lesan/MongoDB mechanics,
> security tests, index method, and performance evidence remain useful. Its domain decisions about
> `categories`, `Product.category`, `SUBSIDIARY_OF`/extra predicates, extra claim types, `visibilityScope`,
> `Source.latestSnapshotId`, and snapshot `version` are **void**. See
> `../adr/0001-v3.1-single-canonical-spec.md` and `00-roadmap.md`.

**Status:** Complete with constraints (2026-11-15) - see `../reports/01-architecture-spike.md`
**Scope:** Backend foundation, with a minimal frontend contract check
**Historical source:** `../../../CONSUMER_TRANSPARENCY_FINAL_ERD.md` (superseded; see banner)
**Working summary:** `../summary.md`

## Purpose

Prove that Deno + Lesan 0.2.3 + MongoDB can implement the ERD baseline without violating its domain
invariants, before any production model or action is written. The spike is a time-boxed, evidence-producing
exercise. Its output is a set of recorded decisions plus a small throwaway harness - not a production
feature.

The spike must answer the questions the ERD leaves open, especially Lesan relation behavior, collection
naming, polymorphic reference validation, immutable source captures, append-only audit, public projections,
and the performance of the core query patterns.

## Timebox

Target: **5 to 8 working days**. If a question cannot be answered in the timebox, record it as blocked with
the evidence gathered; do not silently pick an answer.

## Non-Goals

- No production UI.
- No legal, campaign, market-observation, alternative, or information-request modules.
- No full authentication UX, password reset, email delivery, or account lifecycle.
- No production-grade malware scanner, object storage deployment, or search engine.
- No final visual design.

## Questions the Spike Must Answer

### Lesan and MongoDB

1. How does `coreApp.odm.newModel(name, ...)` map a schema name to a MongoDB collection name? Can the
   canonical snake_case collection names be used without an unsafe mapping layer?
2. What is the exact embedded shape of a `type: "single"` relation snapshot? Does it include all pure
   fields and `_id`? How are projections, excludes, and replacement handled?
3. How do limited `relatedRelations` previews behave for sorting, replacement, deletion, and partial
   failure? Are they safe to expose as previews only?
4. How does `updateRelations` behave when replacing/removing a single relation? Does it update the reverse
   preview atomically? What happens on failure?
5. What does `deleteOne` do with/without `hardCascade`? Which order must dependent records be deleted in?
6. Does type generation produce usable `ReqType`/`DeepSelect` declarations for the frontend, including
   custom actions and unions?
7. Can optimistic concurrency (`version` check) be enforced through a domain action without a race?
8. How are indexes declared (`createIndex`) and verified, including compound and multikey cases?

### Domain

9. Can the three approved fixed-schema relations (`Product.brand`, `Product.category`,
   `SourceSnapshot.source`) be implemented as specified while keeping reverse lists bounded?
10. Can polymorphic references (`Relationship.subject`/`.object`, `Claim.about`, `Correction.target`,
    `AuditEvent.target`, `EvidenceLink.sourceSnapshotId`, `OrganizationResponse.respondingOrganizationId`)
    be validated through a server-controlled registry with no client-controlled collection/model/path?
11. Can SourceSnapshots be effectively immutable in content identity while allowing audited metadata
    correction?
12. Can Audit Events be append-only in all application paths, including correction application, publication,
    retraction, and relation replacement?
13. Can the four status dimensions be updated independently and queried independently without accidental
    collapse?
14. Can a Correction be approved without being applied, then applied idempotently with an expected-version
    check and an Audit Event?
15. Can public projections exclude research notes, private user fields, restricted sources, unreviewed
    submissions, and private asset keys even when a client requests a deep projection?
16. Can asset bytes stay outside MongoDB while snapshots/corrections/responses reference them safely?
17. Can the core query patterns meet acceptable latency with representative seed data?

## Deliverables

1. **Spike harness** - throwaway models/actions/tests sufficient to exercise each question. It lives on a
   spike branch or under a clearly marked throwaway path; it is not merged as production code.
2. **Decision record** - a completed decision table appended to `../summary.md` (or a separate ADR if the
   team prefers) covering naming, relation shape, reverse previews, deletion, auth, projections, assets,
   and indexing.
3. **Evidence pack** - commands, test output, `explain()` plans, BSON size measurements, and screenshots or
   playground requests where relevant.
4. **Go/no-go recommendation** - proceed, proceed with constraints, or change the architecture.
5. **Follow-up plan outline** - the first production slice, informed by the spike.

## Preconditions

- MongoDB 7+ is available locally.
- Deno is installed; `deno.json` pins Lesan 0.2.3.
- `back/.env.example` is copied to `.env` (never commit `.env`).
- The team has agreed that spike code is disposable and that open questions are decided explicitly.

## Tasks

### 1. Bootstrap and observe

- [x] Start a minimal Lesan app and connect to a disposable MongoDB database.
- [x] Confirm the playground and a generated `add`/`get` action work.
- [x] Enable type generation and inspect the generated declarations.
- [x] Record the exact Lesan version, MongoDB version, and Deno version.
- [x] Verify the server fails loudly on missing configuration.

**Exit:** a request/response round-trip and generated types are demonstrated.

### 2. Collection naming and model shape

- [x] Determine how Lesan derives the collection name from the schema name.
- [x] Test canonical names (`products`, `source_snapshots`, etc.) against the actual database.
- [x] Decide: exact snake_case schema names, camelCase schema names with a verified mapping, or a documented
      constraint.
- [x] Confirm `schemaVersion`, `version`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy` conventions.
- [x] Confirm UTC `Date` round-trips and null dates remain null.

**Exit:** a naming decision with evidence and no hidden magic.

### 3. Relation A - Product -> Brand

- [x] Create disposable Product and Brand models with the approved single relation.
- [x] Verify optional relation, null/missing brand, replacement, and removal.
- [x] Verify the Brand reverse preview is limited and not treated as complete.
- [x] Verify the full Product list is a query on `products`, not the reverse preview.
- [x] Verify an index on the embedded brand `_id` is usable.
- [x] Verify projection selection does not leak fields outside the requested shape.

**Exit:** Product/Brand behavior matches ERD Section 10.1.A.

### 4. Relation B - Product -> Category

- [x] Implement the optional single relation.
- [x] Verify Category tree fields (`parentCategoryId`, `ancestorIds`, `depth`) remain ordinary references,
      not a Lesan self-relation.
- [x] Test subtree move and cycle prevention in a domain service (disposable).
- [x] Verify the Category reverse preview is limited and not authoritative.

**Exit:** Product/Category behavior matches ERD Section 10.1.B and tree rules hold.

### 5. Relation C - SourceSnapshot -> Source

- [x] Implement the required single relation.
- [x] Verify a Snapshot belongs to exactly one Source and the reverse preview is bounded.
- [x] Verify full Snapshot history queries `source_snapshots` with `(source._id, retrievedAt desc)`.
- [x] Verify `contentHash` is computed from bytes and the Asset metadata is separate.
- [x] Test that a changed source creates a new Snapshot, never overwrites the prior capture.

**Exit:** Snapshot/Source behavior matches ERD Section 10.1.C and immutability rules.

### 6. Polymorphic reference registry

- [x] Define the allowed endpoint types for Relationship, Claim, Correction, AuditEvent, EvidenceLink, and
      OrganizationResponse.
- [x] Implement a single server-side resolver that validates `{type, id}` against a registry.
- [x] Reject arbitrary collection names, model names, Mongo paths, operators, and unknown types.
- [x] Test each reference type, missing targets, deleted targets, and type/id mismatches.
- [x] Confirm the resolver is used on both write and public read paths.

**Exit:** no action can persist or resolve an unvalidated polymorphic reference.

### 7. Status dimensions and public projection

- [x] Model `recordLifecycle`, `ReviewWorkflow`, `EvidenceAssessment`, and `PublicationState` independently.
- [x] Test transitions that change one dimension without changing the others.
- [x] Verify `SUPPORTED` + `WITHHELD` and `NOT_SUPPORTED` + `PUBLISHED` are representable and queryable.
- [x] Build an allowlisted public projection for a Product profile.
- [x] Attempt a deep client-requested projection and confirm private fields are excluded.
- [x] Confirm no API returns a universal verdict.

**Exit:** status separation and projection safety are demonstrated with negative tests.

### 8. Audit append-only and correction application

- [x] Write Audit Events for create/update/relation-change/publication/retraction/correction-application.
- [x] Confirm no application path updates or deletes an Audit Event.
- [x] Confirm before/after summaries redact secrets and personal data.
- [x] Test `requestId`/`correlationId` grouping.
- [x] Approve a Correction without applying it.
- [x] Apply it through the dedicated domain action with expected-version check and idempotency.
- [x] Confirm a second application attempt is a no-op or controlled conflict.
- [x] Confirm arbitrary `fieldKey`, operation, or `$set`-style patches are rejected.

**Exit:** append-only audit and safe correction application are proven.

### 9. Auth, roles, and tenant-free authorization

- [x] Implement a disposable JWT login with `djwt`; token in header `token`.
- [x] Confirm roles (`CONTRIBUTOR`, `RESEARCHER`, `LEGAL_REVIEWER`, `MODERATOR`, `ADMIN`) are loaded from
      the database, never trusted from the client.
- [x] Confirm `trustLevel` is not treated as an authorization role.
- [x] Define the public/research/legal/admin authorization matrix.
- [x] Test guest search/scan without an account.
- [x] Test unauthorized access to research queues, audit events, and private assets.

**Exit:** authorization is server-derived and the public/research split is enforced.

### 10. Assets, uploads, and URL capture

- [x] Implement a local development storage provider; keep bytes out of MongoDB.
- [x] Validate MIME from bytes, enforce size/type allowlists, and quarantine until scanning/validation.
- [x] Strip or review EXIF/personal metadata before public use.
- [x] Serve short-lived authorized download URLs; never expose private object keys.
- [x] Harden any URL fetcher: HTTPS, block private/link-local/reserved/metadata addresses, revalidate
      redirects/DNS, cap redirects/time/body, send no ambient credentials.
- [x] Confirm restricted snapshots cannot become public because a related finding is published.

**Exit:** asset and untrusted-input rules are enforced, with negative tests.

### 11. Identifier resolution

- [x] Define the supported identifier schemes and normalization rules.
- [x] Store GTIN and other identifiers as strings.
- [x] Validate GTIN length/check digit where applicable.
- [x] Resolve by exact scheme + value + scope; never compare values across schemes.
- [x] Return `NOT_FOUND`, `AMBIGUOUS`, `DISPUTED`, `UNVERIFIED` as explicit outcomes.
- [x] Confirm no GS1 prefix or barcode allocation is used to infer country, ownership, or status.

**Exit:** identifier resolution is exact and inference-free.

### 12. Query and index benchmark

Seed representative data (adjust after reviewing expected volumes):

- 10,000 Products across 500 Brands and 200 Categories.
- 50,000 Relationships with mixed predicates, markets, and validity ranges.
- 50,000 SourceSnapshots across 5,000 Sources.
- 5,000 Claims and 2,000 Corrections in mixed review/publication states.

Measure with `explain("executionStats")`:

- [x] Identifier lookup.
- [x] Product list by Brand/Category with pagination.
- [x] Outgoing/incoming Relationship lists.
- [x] Relationship timeline for an entity.
- [x] Published findings for a target.
- [x] Research queue filters (review status + assignee + date).
- [x] Snapshot history for a Source.
- [x] Audit Events for a target/actor.
- [x] Counts by status/predicate/market/date.

Record: p50/p95 latency, documents examined, index used, and any collection scan. Test BSON size of a
Relationship/Claim with representative embedded evidence/responses/notes; warn before several MiB and
require a split decision well before 16 MiB.

**Exit:** every core query has a usable index or a documented plan; no accidental collection scans.

### 13. Frontend contract check

- [x] Consume generated declarations from a minimal Next.js server action.
- [x] Confirm the token header, error shape, and projection types work.
- [x] Confirm public profile data can be rendered with separate status dimensions.
- [x] Confirm `fa`/`en`/`ar` message placeholders can wrap the response without hardcoded copy.
- [x] Do not build production pages.

**Exit:** the backend contract is usable from the frontend without leaking private fields.

### 14. Decision gate

- [x] Complete the decision table in `../summary.md`.
- [x] Answer or explicitly block ERD Section 18 questions.
- [x] Record constraints and rejected alternatives.
- [x] Produce a go/no-go recommendation.
- [x] Outline the first production slice and its tests.
- [x] Remove or isolate throwaway spike code before merging documentation.

**Exit:** the team can start the first production plan without reopening the architecture.

## Decision Table (Fill During Spike)

| Decision | Result | Evidence | Follow-up |
|---|---|---|---|
| Lesan schema/collection naming | Exact canonical snake_case schema names; no mapping layer | `tests/spike_01...` | Keep names stable |
| Single relation snapshot shape | Embedded pure fields + `_id`; internal fields excluded; `{}` = absent | `tests/spike_01...` | Treat `{}` as absent |
| Reverse preview behavior/limits | Bounded preview only, not a count/list | `tests/spike_01...`, `tests/spike_02...` | Name fields `*Preview` |
| `updateRelations` semantics | `replace: true` updates both sides; removal leaves `{}` | `tests/spike_01...` | Audited domain actions only |
| Deletion/`hardCascade` policy | No cascade; children first; dependents block parent deletion | `tests/spike_01...` | Archive by default |
| Type generation contract | `ReqType`, model schemas, actions generated; frontend typecheck passed | `tests/spike_10...` | Regenerate from production models |
| Optimistic concurrency | Expected version + atomic bump; stale rejected; sequential idempotency | `tests/spike_05...` | Prove concurrent double-apply |
| Index declaration/verification | Eight query shapes index-backed, no collection scans | `tests/spike_09...`, report Section 5 | Re-verify on production-like data |
| Polymorphic reference registry | Only `{type, id}` with per-field endpoint allowlists and target checks | `tests/spike_03...` | Enforce every read/write |
| Snapshot immutability | Content identity not correctable; changed content = new snapshot | `tests/spike_02...`, `tests/spike_05...` | Enforce DB privileges too |
| Audit append-only enforcement | Append/list only; update/delete throw; redaction proven | `tests/spike_05...` | Deny DB-level mutation |
| Correction application/idempotency | Approval separate; allowlisted, versioned, keyed, audited | `tests/spike_05...` | Transaction/unique ledger |
| Auth/roles/public split | DB roles, claims ignored, guest public-only, `token` header without `Bearer` | `tests/spike_06...` | Wire into pre-acts; HTTP test |
| Asset storage/scanning | Bytes outside Mongo; quarantine, MIME sniffing, EXIF strip, signed URLs | `tests/spike_07...` | Object storage + maintained scanner |
| SSRF hardening | HTTPS/443, private/reserved blocks, DNS/redirect revalidation, caps | `tests/spike_07...` | Pin resolved IP at connect |
| Identifier normalization | Exact check-digit normalization; strings preserved; no GS1 inference | `tests/spike_08...` | Confirm first schemes/issuers |
| Search baseline | Normalized prefix search only; no fuzzy matching in MVP | `tests/spike_08...` | Add measured read model later |
| BSON growth thresholds | Representative 23.8 KB; 1,000 links 1.1 MB; 15,000 exits 16 MiB; cap evidence at 500 | `tests/spike_09...`, report Section 5 | Revisit with real data |

## Acceptance Criteria

The spike passes only if all of the following are evidenced:

1. The three fixed-schema Lesan relations behave as specified, with bounded reverse previews.
2. Polymorphic references cannot be persisted or resolved without registry validation.
3. SourceSnapshots are content-immutable, and asset bytes remain outside MongoDB.
4. Audit Events are append-only in every tested path.
5. A Correction can be approved without application, then applied once with expected-version and audit.
6. Status dimensions are independently mutable, queryable, and visible in the public contract.
7. A deep client projection cannot leak private/research/restricted data.
8. Identifier lookup is exact, index-backed, and inference-free.
9. Core queries have a documented index/plan and acceptable latency on representative data.
10. The frontend can consume the generated contract without a direct backend fetch.

## Performance Targets (Starting Points, Not Promises)

- Identifier lookup p95 under 100 ms locally on the seeded dataset.
- Product/Brand/Category and Relationship list p95 under 200 ms locally.
- Research queue p95 under 300 ms locally.
- No core query performs a collection scan after warm-up.
- Representative Relationship/Claim documents stay well below 1 MiB; any projected growth near several MiB
  triggers a split decision.

Adjust targets with product needs; record the reason for any change.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Lesan relation behavior differs from assumptions | Test replacement, removal, deletion, projections, and reverse previews first. |
| Collection naming requires a mapping layer | Decide early; prefer explicit configuration over raw string manipulation. |
| Reverse previews used as complete lists | Name them `*Preview`, enforce limits in code review, and test counts against owning queries. |
| Type generation is incomplete | Add a thin typed wrapper; do not hand-maintain duplicate domain types. |
| Embedded evidence/responses grow too large | Measure BSON size; define per-parent limits and split triggers now. |
| Audit updates slip through | Centralize writes; deny update/delete at the service layer; add negative tests. |
| Public projection leaks | Build allowlisted projections; add adversarial tests with deep `get` requests. |
| SSRF via URL capture | Use a hardened fetcher with DNS/redirect revalidation and network denylist. |
| Persian/Arabic normalization is underspecified | Start with exact normalized values; benchmark search before adding fuzzy matching. |
| Open questions block implementation | Record blocked questions and do not encode a silent default. |

## Out of Scope

- Legal assessments, campaigns, alternatives, market observations, information requests.
- Full search engine, analytics warehouse, or read-model infrastructure.
- Production deployment, backups, monitoring, or incident response.
- Complete localization catalogs.

## Verification Commands

```bash
cd back
deno task fmt:check
deno task lint
deno task check
deno task test

cd ../front
pnpm typecheck
pnpm lint
```

Plus the spike-specific evidence: playground requests, test output, `explain()` plans, and BSON measurements.

## Definition of Done

- Decision table completed and linked from `../summary.md`.
- Acceptance criteria met with evidence.
- Open questions either answered or explicitly blocked.
- Spike code isolated/removed; no production feature merged.
- Go/no-go recommendation written.
- Next production slice defined with tests and security checks.
