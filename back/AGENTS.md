# Ansoo Backend - Deno + Lesan

## Purpose

This backend resolves product identifiers to a transparent product profile and manages the domain records
behind it: identity, time-aware relationships, claims, sources, evidence, corrections, users, and audit
events. It is the enforcement point for authorization, validation, history, provenance, and audit.

**Status: scaffold only.** Do not implement production features until the Architecture Spike in
`docs/plans/01-architecture-spike.md` is complete and its decisions are recorded.

## Stack

| Concern | Technology |
|---|---|
| Runtime | Deno |
| Framework | Lesan 0.2.3 (MongoDB ODM, generated API, playground, type generation) |
| Database | MongoDB |
| Auth | JWT via djwt; token in HTTP header `token` (no `Bearer` prefix) |
| Asset bytes | Object storage (local dev provider; S3-compatible in production) |
| Asset metadata | `assets` collection only (hashes, MIME, size, visibility, processing) |

## Layout

```
back/
├── mod.ts                 # Entry point (scaffold)
├── deno.json              # Tasks, imports, compiler options
├── models/                # One model file per canonical collection + mod.ts
├── src/<model>/<action>/  # Lesan action triad: mod.ts, <action>.fn.ts, <action>.val.ts
├── src/search/            # Cross-collection identifier and entity search
├── utils/                 # Auth context, scope guards, reference registry, audit helpers
├── declarations/          # Generated type declarations (Lesan typeGeneration)
├── http/                  # Manual playground/E2E requests
├── tests/                 # Deno tests
├── docs/                  # summary.md, plans/, prompts/
└── uploads/               # Local development asset bytes (never commit content)
```

Scaffolded action groups: `user`, `asset`, `product`, `brand`, `category`, `organization`,
`relationship`, `claim`, `source`, `sourceSnapshot`, `correction`, `auditEvent`, plus cross-cutting
`search`. Only `product` has a relation-update group (`brand`/`category`); every other model updates pure
fields and uses dedicated domain actions.

## Canonical Collections

The ERD owns the domain. These names are canonical; schema/collection naming in Lesan must be confirmed
by the spike:

`products`, `brands`, `categories`, `organizations`, `relationships`, `claims`, `sources`,
`source_snapshots`, `assets`, `corrections`, `users`, `audit_events`.

Read `../CONSUMER_TRANSPARENCY_FINAL_ERD.md` and `docs/summary.md` before changing a model.

## Critical Lesan Rules

1. **Relations are one-directional.** Define a relation only on the model that owns the foreign key
   ("child"), with `relatedRelations` for the bounded reverse. Never declare the reverse again on the
   parent. Lesan embeds `type: "single"` relations in the parent document; do not duplicate the same data
   as `xId`/`xName` fields.
2. **Only three fixed-schema Lesan relations are approved:** `Product.brand` -> Brand,
   `Product.category` -> Category, `SourceSnapshot.source` -> Source. Each is optional except the snapshot
   source. Reverse names (`productsPreview`, `recentSnapshotsPreview`) are limited previews only.
3. **Polymorphic references are not Lesan relations.** `Relationship.subject`/`.object`, `Claim.about`,
   `Claim.relatedEntities`, `Correction.target`, `AuditEvent.target`, `EvidenceLink.sourceSnapshotId`, and
   `OrganizationResponse.respondingOrganizationId` are typed ObjectId references. Resolve and validate
   them through a server-controlled registry on every read/write. Never accept a collection name, model
   name, Mongo path, or operator from a client.
4. **Reverse relations are previews.** A limited reverse array is never an authoritative list, count,
   export, or research corpus. Query the owning collection for complete, paginated data.
5. **Never raw-update Lesan relation snapshots.** Use `updateRelations` or a dedicated domain action.
   Relation replacement, deletion, sorting, limits, and partial-failure behavior must be verified in the
   spike against the installed version.
6. **`hardCascade` is dangerous.** Default to safe deletion, delete children before parents, and never use
   cascade for routine cleanup.
7. **Separate pure updates from relation updates.** `update` changes pure fields; `updateRelations`
   changes relations with explicit replacement semantics.
8. **Action triad.** Every action is `mod.ts` (registration, preActs, validator), `<action>.fn.ts`
   (implementation), and `<action>.val.ts` (validation + `get` projection). Keep validators strict and
   projections explicit.
9. **Indexes follow the ERD, not guesswork.** Verify with `explain()` on representative data. Treat
   compound/multikey array constraints and uniqueness carefully. Do not add a unique index before
   identifier scope, jurisdiction, issuer, and real duplicate cases are settled.
10. **Respect document growth limits.** MongoDB BSON is capped at 16 MiB, but stay far below it. Embedded
    evidence, responses, notes, and revision previews are bounded; require a deliberate split before any
    aggregate approaches several MiB.

## Domain Invariants

- Product != Brand != Organization. A corporate group and its legal entities are separate Organization
  records; ownership/control/manufacturing/import/distribution are Relationship edges.
- A Relationship is a directed edge `{subject, predicate, object}` with real-world `validity` and
  platform `recordedAt`. A new owner/period is a new edge. Never rewrite an old edge's subject to show a
  new owner. Corrections increment `version` and write an Audit Event.
- `validity.validTo: null` means no end date is recorded; it does not prove the edge is current today.
  Unknown dates stay `null`; never invent precision.
- Source is an identity; SourceSnapshot is an immutable capture with its own hash, retrieval time,
  capture method, and Asset. A changed source creates a new Snapshot. Never replace captured bytes
  without trace.
- `recordLifecycle`, `review.status`, `assessment.outcome`, and `publication.status` are independent.
  `SUPPORTED` does not imply `PUBLISHED`; `NOT_SUPPORTED` does not mean `FALSE`. Never expose a single
  ethical/legal/boycott verdict.

## Accountability Rules

- **Audit Events are append-only.** No update or delete path. Record publication/retraction, approvals,
  evidence changes, Relationship endpoint/validity changes, permission changes, and correction
  application. Use `requestId`/`correlationId` for workflow grouping. Redact secrets and personal data.
- **Corrections are proposals.** Never apply `proposedValue` as an arbitrary `$set`. Validate `fieldKey`
  and `operation` against a strict per-target allowlist. Approval is not application; application runs
  through a domain action with authorization, expected-version check, idempotency, and an Audit Event.
  The submitter never edits canonical data directly.
- **Users:** `roles` (`CONTRIBUTOR`, `RESEARCHER`, `LEGAL_REVIEWER`, `MODERATOR`, `ADMIN`) are
  authorization; `trustLevel` is not. Guests may search/scan without an account. Keep scan history local
  by default. Never expose email, phone, auth identifiers, roles, or private profile data publicly.

## Assets and Untrusted Input

- Store bytes in object storage, never as base64 in MongoDB.
- Inspect bytes to validate MIME; enforce size/extension/content-type allowlists.
- Quarantine uploads until scanning/validation; strip or review EXIF and personal data before public use.
- Serve short-lived authorized URLs; never expose private bucket/object keys.
- Any URL fetcher is SSRF-sensitive: HTTPS by default, block private/link-local/reserved ranges and
  cloud metadata endpoints, revalidate redirects and DNS, cap redirects/time/body size, and send no
  ambient credentials.

## Public Projection Rules

- Public responses are allowlisted projections. A deeper client-requested projection is not authorization.
- Never return research notes, unreviewed submissions, restricted sources, internal roles, private user
  fields, private asset keys, or security metadata.
- A Product profile must show identity, brand-mapping state, relationships with predicate/market/dates/
  evidence state, claims with exact wording/scope/assessment/publication, provenance, unknowns, conflicts,
  and limitations separately.

## Commands

```bash
deno task dev          # watch mode
deno task start
deno task fmt
deno task fmt:check
deno task lint
deno task check
deno task test
```

Playground: `http://localhost:1370/playground`. Environment: copy `.env.example` to `.env`.

## Before Writing Backend Code

1. Read the ERD and `docs/summary.md`.
2. Confirm the spike decision for collection naming, relation boundaries, projections, and type generation.
3. Use the existing action folder pattern; do not invent a second architecture.
4. Add tests for authorization, validation, history, audit, and public-projection leaks.
5. Run `deno task fmt`, `deno task lint`, `deno task check`, and `deno task test`.
