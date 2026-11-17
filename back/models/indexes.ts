// Starting index set from spec Section 17.
//
// Every index is paired with a named query in INDEX_QUERIES. Create an index
// only after that query exists; tests verify each plan with explain().

import type { Db } from "lesan";
import { ObjectId } from "lesan";
import type { ModelName } from "./mod.ts";

export type IndexDefinition = {
  key: Record<string, 1 | -1>;
  name: string;
  options?: {
    unique?: boolean;
    sparse?: boolean;
  };
};

export const INDEX_DEFINITIONS: Partial<Record<ModelName, readonly IndexDefinition[]>> = {
  products: [
    {
      key: {
        "identifiers.scheme": 1,
        "identifiers.normalizedValue": 1,
        "identifiers.jurisdiction": 1,
      },
      name: "products_identifier",
    },
    { key: { "identifiers.matchValue": 1 }, name: "products_matchValue" },
    { key: { matchKey: 1 }, name: "products_matchKey" },
    { key: { "brand._id": 1, lifecycle: 1 }, name: "products_brand_lifecycle" },
    { key: { categoryCode: 1, lifecycle: 1 }, name: "products_category_lifecycle" },
  ],
  brands: [
    { key: { matchKey: 1 }, name: "brands_matchKey" },
    { key: { "aliases.matchKey": 1 }, name: "brands_alias_matchKey" },
    { key: { lifecycle: 1, updatedAt: -1 }, name: "brands_lifecycle_updatedAt" },
  ],
  organizations: [
    { key: { matchKey: 1 }, name: "organizations_matchKey" },
    {
      key: {
        "identifiers.scheme": 1,
        "identifiers.normalizedValue": 1,
        "identifiers.jurisdiction": 1,
      },
      name: "organizations_identifier",
    },
    { key: { kind: 1, lifecycle: 1 }, name: "organizations_kind_lifecycle" },
  ],
  relationships: [
    {
      key: {
        "subject.type": 1,
        "subject.id": 1,
        predicate: 1,
        recordLifecycle: 1,
      },
      name: "relationships_subject_predicate",
    },
    {
      key: {
        "object.type": 1,
        "object.id": 1,
        predicate: 1,
        recordLifecycle: 1,
      },
      name: "relationships_object_predicate",
    },
    {
      key: { "review.status": 1, updatedAt: -1 },
      name: "relationships_review_queue",
    },
    {
      key: { "review.status": 1, "review.assignedTo": 1, updatedAt: -1 },
      name: "relationships_review_assignee",
    },
    {
      key: { "publication.status": 1, updatedAt: -1 },
      name: "relationships_publication",
    },
    {
      key: {
        "context.marketCountryCode": 1,
        predicate: 1,
        recordLifecycle: 1,
      },
      name: "relationships_market_predicate",
    },
  ],
  claims: [
    {
      key: {
        "about.type": 1,
        "about.id": 1,
        claimType: 1,
        recordLifecycle: 1,
      },
      name: "claims_about_type",
    },
    {
      key: { "review.status": 1, updatedAt: -1 },
      name: "claims_review_queue",
    },
    {
      key: { "review.status": 1, "review.assignedTo": 1, updatedAt: -1 },
      name: "claims_review_assignee",
    },
    {
      key: { "publication.status": 1, updatedAt: -1 },
      name: "claims_publication",
    },
  ],
  sources: [
    { key: { canonicalUrl: 1 }, name: "sources_canonicalUrl" },
    { key: { sourceType: 1, lifecycle: 1 }, name: "sources_type_lifecycle" },
  ],
  source_snapshots: [
    {
      key: { "source._id": 1, retrievedAt: -1 },
      name: "snapshots_source_retrievedAt",
    },
    { key: { contentHash: 1 }, name: "snapshots_contentHash" },
  ],
  corrections: [
    { key: { status: 1, submittedAt: -1 }, name: "corrections_status_submittedAt" },
    { key: { submittedBy: 1, submittedAt: -1 }, name: "corrections_submitter_submittedAt" },
    {
      key: { "target.type": 1, "target.id": 1, status: 1 },
      name: "corrections_target_status",
    },
    {
      key: { "application.idempotencyKey": 1 },
      name: "corrections_application_idempotency",
      options: { unique: true, sparse: true },
    },
  ],
  audit_events: [
    {
      key: { "target.type": 1, "target.id": 1, occurredAt: -1 },
      name: "audit_target_occurredAt",
    },
    {
      key: { "actor.type": 1, "actor.id": 1, occurredAt: -1 },
      name: "audit_actor_occurredAt",
    },
    { key: { correlationId: 1 }, name: "audit_correlationId" },
  ],
};

export type IndexQuery = {
  collection: ModelName;
  indexName: string;
  purpose: string;
  filter: Record<string, unknown>;
  sort?: Record<string, 1 | -1>;
};

const placeholderId = new ObjectId();

export const INDEX_QUERIES: readonly IndexQuery[] = [
  {
    collection: "products",
    indexName: "products_identifier",
    purpose: "resolve a scanned identifier by scheme/value/jurisdiction",
    filter: {
      "identifiers.scheme": "GTIN",
      "identifiers.normalizedValue": "0006381333931",
      "identifiers.jurisdiction": "IR",
    },
  },
  {
    collection: "products",
    indexName: "products_matchValue",
    purpose: "resolve a GTIN matchValue",
    filter: { "identifiers.matchValue": "0006381333931" },
  },
  {
    collection: "products",
    indexName: "products_matchKey",
    purpose: "exact normalized product name candidate lookup",
    filter: { matchKey: "sampleproduct" },
  },
  {
    collection: "products",
    indexName: "products_brand_lifecycle",
    purpose: "list active products for a brand",
    filter: { "brand._id": placeholderId, lifecycle: "ACTIVE" },
  },
  {
    collection: "products",
    indexName: "products_category_lifecycle",
    purpose: "list active products in a category",
    filter: { categoryCode: "sample.category", lifecycle: "ACTIVE" },
  },
  {
    collection: "brands",
    indexName: "brands_matchKey",
    purpose: "exact normalized brand lookup",
    filter: { matchKey: "samplebrand" },
  },
  {
    collection: "brands",
    indexName: "brands_alias_matchKey",
    purpose: "brand lookup through an alias",
    filter: { "aliases.matchKey": "sample" },
  },
  {
    collection: "brands",
    indexName: "brands_lifecycle_updatedAt",
    purpose: "recently updated active/archived brands",
    filter: { lifecycle: "ACTIVE" },
    sort: { updatedAt: -1 },
  },
  {
    collection: "organizations",
    indexName: "organizations_matchKey",
    purpose: "exact normalized organization lookup",
    filter: { matchKey: "sampleorg" },
  },
  {
    collection: "organizations",
    indexName: "organizations_identifier",
    purpose: "resolve an organization official identifier",
    filter: {
      "identifiers.scheme": "NATIONAL_ID",
      "identifiers.normalizedValue": "123",
      "identifiers.jurisdiction": "IR",
    },
  },
  {
    collection: "organizations",
    indexName: "organizations_kind_lifecycle",
    purpose: "list organizations by kind and lifecycle",
    filter: { kind: "LEGAL_ENTITY", lifecycle: "ACTIVE" },
  },
  {
    collection: "relationships",
    indexName: "relationships_subject_predicate",
    purpose: "find outgoing edges for a subject and predicate",
    filter: {
      "subject.type": "ORGANIZATION",
      "subject.id": placeholderId,
      predicate: "OWNS",
      recordLifecycle: "ACTIVE",
    },
  },
  {
    collection: "relationships",
    indexName: "relationships_object_predicate",
    purpose: "find incoming edges for an object and predicate",
    filter: {
      "object.type": "BRAND",
      "object.id": placeholderId,
      predicate: "OWNS",
      recordLifecycle: "ACTIVE",
    },
  },
  {
    collection: "relationships",
    indexName: "relationships_review_queue",
    purpose: "global review queue by status, newest first",
    filter: { "review.status": "QUEUED" },
    sort: { updatedAt: -1 },
  },
  {
    collection: "relationships",
    indexName: "relationships_review_assignee",
    purpose: "assignee review queue by status, newest first",
    filter: { "review.status": "QUEUED", "review.assignedTo": placeholderId },
    sort: { updatedAt: -1 },
  },
  {
    collection: "relationships",
    indexName: "relationships_publication",
    purpose: "publication queue by status, newest first",
    filter: { "publication.status": "PENDING_REVIEW" },
    sort: { updatedAt: -1 },
  },
  {
    collection: "relationships",
    indexName: "relationships_market_predicate",
    purpose: "market-scoped active edges by predicate",
    filter: {
      "context.marketCountryCode": "IR",
      predicate: "IMPORTS_TO_MARKET",
      recordLifecycle: "ACTIVE",
    },
  },
  {
    collection: "claims",
    indexName: "claims_about_type",
    purpose: "find claims about an entity and claim type",
    filter: {
      "about.type": "PRODUCT",
      "about.id": placeholderId,
      claimType: "MARKET_PRESENCE",
      recordLifecycle: "ACTIVE",
    },
  },
  {
    collection: "claims",
    indexName: "claims_review_queue",
    purpose: "global claim review queue, newest first",
    filter: { "review.status": "QUEUED" },
    sort: { updatedAt: -1 },
  },
  {
    collection: "claims",
    indexName: "claims_review_assignee",
    purpose: "assignee claim review queue, newest first",
    filter: { "review.status": "QUEUED", "review.assignedTo": placeholderId },
    sort: { updatedAt: -1 },
  },
  {
    collection: "claims",
    indexName: "claims_publication",
    purpose: "claim publication queue, newest first",
    filter: { "publication.status": "PENDING_REVIEW" },
    sort: { updatedAt: -1 },
  },
  {
    collection: "sources",
    indexName: "sources_canonicalUrl",
    purpose: "find a source by canonical URL",
    filter: { canonicalUrl: "https://example.test/registry" },
  },
  {
    collection: "sources",
    indexName: "sources_type_lifecycle",
    purpose: "list sources by type and lifecycle",
    filter: { sourceType: "OFFICIAL_REGISTRY", lifecycle: "ACTIVE" },
  },
  {
    collection: "source_snapshots",
    indexName: "snapshots_source_retrievedAt",
    purpose: "recent snapshots for a source",
    filter: { "source._id": placeholderId },
    sort: { retrievedAt: -1 },
  },
  {
    collection: "source_snapshots",
    indexName: "snapshots_contentHash",
    purpose: "deduplicate captured bytes by SHA-256",
    filter: { contentHash: "a".repeat(64) },
  },
  {
    collection: "corrections",
    indexName: "corrections_status_submittedAt",
    purpose: "correction queue by status, newest first",
    filter: { status: "PENDING" },
    sort: { submittedAt: -1 },
  },
  {
    collection: "corrections",
    indexName: "corrections_submitter_submittedAt",
    purpose: "a submitter's corrections, newest first",
    filter: { submittedBy: placeholderId },
    sort: { submittedAt: -1 },
  },
  {
    collection: "corrections",
    indexName: "corrections_target_status",
    purpose: "corrections for one target by status",
    filter: { "target.type": "PRODUCT", "target.id": placeholderId, status: "PENDING" },
  },
  {
    collection: "corrections",
    indexName: "corrections_application_idempotency",
    purpose: "prevent double application by idempotency key",
    filter: { "application.idempotencyKey": "apply-1" },
  },
  {
    collection: "audit_events",
    indexName: "audit_target_occurredAt",
    purpose: "audit trail for one target, newest first",
    filter: { "target.type": "PRODUCT", "target.id": placeholderId },
    sort: { occurredAt: -1 },
  },
  {
    collection: "audit_events",
    indexName: "audit_actor_occurredAt",
    purpose: "audit trail for one actor, newest first",
    filter: { "actor.type": "USER", "actor.id": placeholderId },
    sort: { occurredAt: -1 },
  },
  {
    collection: "audit_events",
    indexName: "audit_correlationId",
    purpose: "group audit events by workflow correlation",
    filter: { correlationId: "corr-1" },
  },
];

export async function createIndexes(db: Db): Promise<void> {
  for (const [collection, definitions] of Object.entries(INDEX_DEFINITIONS)) {
    const indexes = (definitions as readonly IndexDefinition[]).map((definition) => ({
      key: definition.key,
      name: definition.name,
      ...definition.options,
    }));
    if (indexes.length > 0) {
      await db.collection(collection).createIndexes(indexes);
    }
  }
}
