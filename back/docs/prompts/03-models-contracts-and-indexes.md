# Agent Prompt - Execute Plan 03 (Models, Contracts, and Indexes)

Read `README.md` here, then `../plans/03-models-contracts-and-indexes.md`, spec Sections 3-10 and 15-17,
plan 02's shared constants, and the ADR log.

## Mission

Implement the persistence boundary: exactly eleven collections, shared embedded contracts, hard caps in
validators, exactly two Lesan relations, and a verified starting index set.

## Sequence

1. **Confirm the installed Lesan API** for model declaration, embedded objects, relations, and indexes.
2. **Common types:** `DocMeta`, `Mergeable`, `Validity`, `Alias`, `LocalizedName`, `IdentityProvenance`,
   `Sensitivity`; snapshots/audit are immutable and carry no mutable metadata.
3. **Identity:** products, brands, organizations. No Brand `ownerId`; no Category collection;
   `categoryCode` validated against `taxonomy.v1.json`; typed product attributes only.
4. **Graph/research:** relationships and claims. Enforce the five-predicate matrix and three claim types;
   required context; no `OTHER_*`.
5. **Provenance:** sources, snapshots, assets. Snapshot has no `version`; hash is original-byte SHA-256;
   source has no `latestSnapshotId`; bytes stay outside Mongo.
6. **Governance:** corrections, users, audit_events. Flat audit summaries; no PII/secrets; unique sparse
   application idempotency key.
7. **Embedded contracts:** EvidenceLink, ReviewWorkflow, EvidenceAssessment, PublicationState,
   PublicationGate, ResponseSolicitation, OrganizationResponse, ResearchNote, RevisionPreview.
8. **Caps:** enforce every Section 4.5 cap with `422 CAP_EXCEEDED`; reject forbidden patch fields.
9. **Relations:** Product.brand optional + Brand.productsPreview limit 20; SourceSnapshot.source required +
   Source.recentSnapshotsPreview limit 10. No other relation.
10. **Indexes:** create only for named queries; verify `explain("executionStats")`; no forbidden unique
    index on identifiers/aliases/matchKey/canonicalUrl/canonicalKey.
11. **Report** `../reports/03-models-contracts-and-indexes.md`.

## Do Not

- Do not add `categories`, `evidence_items`, `verification_cases`, or `review_cases`.
- Do not add a unique index unless spec Section 17 allows it.
- Do not put bytes, base64, or a score in MongoDB.
- Do not use `hardCascade` or raw-update relation snapshots.
- Do not let an embedded array exceed its cap silently.

## Evidence Required

- Collection/model inventory with exact schema names.
- Cap tests at boundary and over-limit.
- Relation snapshot/reverse-preview tests.
- `explain` output per index and BSON sizes.
- Verification logs.

## Stop Conditions

Stop if Lesan cannot represent a required shape without a workaround that changes the domain, if an index
cannot support a core query, or if a cap conflicts with an embedded contract.
