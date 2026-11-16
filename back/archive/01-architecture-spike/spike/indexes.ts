// Spike index declarations. Verify every one with explain("executionStats")
// before treating it as a production index.
import type { Db } from "lesan";

export async function createSpikeIndexes(db: Db) {
  await db.collection("products").createIndexes([
    { key: { normalizedName: 1 }, name: "products_normalizedName" },
    {
      key: {
        "identifiers.scheme": 1,
        "identifiers.normalizedValue": 1,
        "identifiers.jurisdiction": 1,
      },
      name: "products_identifier",
    },
    {
      key: { "brand._id": 1, recordLifecycle: 1, normalizedName: 1 },
      name: "products_brand_lifecycle_name",
    },
    {
      key: { "category._id": 1, recordLifecycle: 1, normalizedName: 1 },
      name: "products_category_lifecycle_name",
    },
  ]);

  await db.collection("brands").createIndexes([
    { key: { normalizedName: 1 }, name: "brands_normalizedName" },
    { key: { "aliases.normalizedValue": 1 }, name: "brands_alias" },
    {
      key: { recordLifecycle: 1, updatedAt: -1 },
      name: "brands_lifecycle_updated",
    },
  ]);

  await db.collection("categories").createIndexes([
    { key: { code: 1 }, name: "categories_code" },
    {
      key: { parentCategoryId: 1, sortOrder: 1 },
      name: "categories_parent_sort",
    },
    { key: { ancestorIds: 1 }, name: "categories_ancestors" },
  ]);

  await db.collection("organizations").createIndexes([
    { key: { normalizedName: 1 }, name: "orgs_normalizedName" },
    {
      key: { "identifiers.scheme": 1, "identifiers.normalizedValue": 1 },
      name: "orgs_identifier",
    },
    { key: { kind: 1, recordLifecycle: 1 }, name: "orgs_kind_lifecycle" },
    {
      key: { operatingCountryCodes: 1, kind: 1 },
      name: "orgs_country_kind",
    },
  ]);

  await db.collection("relationships").createIndexes([
    {
      key: {
        "subject.type": 1,
        "subject.id": 1,
        predicate: 1,
        recordLifecycle: 1,
      },
      name: "rel_subject_predicate",
    },
    {
      key: {
        "object.type": 1,
        "object.id": 1,
        predicate: 1,
        recordLifecycle: 1,
      },
      name: "rel_object_predicate",
    },
    {
      key: { "review.status": 1, updatedAt: -1 },
      name: "rel_review_queue",
    },
    {
      key: { "review.status": 1, "review.assignedTo": 1, updatedAt: -1 },
      name: "rel_review_assignee",
    },
    {
      key: { "assessment.outcome": 1, updatedAt: -1 },
      name: "rel_assessment",
    },
    {
      key: { "publication.status": 1, updatedAt: -1 },
      name: "rel_publication",
    },
    {
      key: {
        "context.marketCountryCode": 1,
        predicate: 1,
        recordLifecycle: 1,
      },
      name: "rel_market_predicate",
    },
  ]);

  await db.collection("claims").createIndexes([
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
      key: { "assessment.outcome": 1, updatedAt: -1 },
      name: "claims_assessment",
    },
    {
      key: { "publication.status": 1, updatedAt: -1 },
      name: "claims_publication",
    },
    {
      key: { "scope.marketCountryCode": 1, claimType: 1 },
      name: "claims_market_type",
    },
  ]);

  await db.collection("sources").createIndexes([
    { key: { canonicalUrl: 1 }, name: "sources_canonicalUrl" },
    {
      key: { sourceType: 1, recordLifecycle: 1 },
      name: "sources_type_lifecycle",
    },
  ]);

  await db.collection("source_snapshots").createIndexes([
    {
      key: { "source._id": 1, retrievedAt: -1 },
      name: "snapshots_source_retrieved",
    },
    { key: { contentHash: 1 }, name: "snapshots_contentHash" },
  ]);

  await db.collection("corrections").createIndexes([
    { key: { status: 1, submittedAt: -1 }, name: "corrections_status_date" },
    { key: { submittedBy: 1, submittedAt: -1 }, name: "corrections_submitter" },
    {
      key: { "target.type": 1, "target.id": 1, status: 1 },
      name: "corrections_target_status",
    },
    {
      key: { "review.assignedTo": 1, status: 1, submittedAt: -1 },
      name: "corrections_review_queue",
    },
  ]);

  await db.collection("audit_events").createIndexes([
    {
      key: { "target.type": 1, "target.id": 1, occurredAt: -1 },
      name: "audit_target_date",
    },
    {
      key: { "actor.type": 1, "actor.id": 1, occurredAt: -1 },
      name: "audit_actor_date",
    },
    { key: { requestId: 1 }, name: "audit_requestId" },
    { key: { correlationId: 1 }, name: "audit_correlationId" },
  ]);
}
