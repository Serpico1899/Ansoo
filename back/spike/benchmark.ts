// Representative seed data plus explain()/latency/BSON measurements.
import { BSON, type Db, ObjectId } from "lesan";
import { createSpikeIndexes } from "./indexes.ts";

const predicateList = [
  "OWNS",
  "CONTROLS",
  "SUBSIDIARY_OF",
  "MANUFACTURES",
  "DISTRIBUTES",
  "IMPORTS_TO_MARKET",
  "EXPORTS_TO_MARKET",
  "SUPPLIES",
  "OPERATES",
] as const;
const reviewList = [
  "NOT_QUEUED",
  "QUEUED",
  "IN_REVIEW",
  "NEEDS_INFORMATION",
  "READY_FOR_DECISION",
  "CLOSED",
] as const;
const assessmentList = [
  "NOT_ASSESSED",
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "NOT_SUPPORTED",
  "DISPUTED",
  "INCONCLUSIVE",
] as const;
const publicationList = [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "WITHHELD",
  "RETRACTED",
] as const;
const markets = ["IR", "DE", "US", "TR", "AE", "GB"];

function oid(n: number): ObjectId {
  return ObjectId.createFromHexString(n.toString(16).padStart(24, "0"));
}

function gtin13(n: number): string {
  const body = String(n).padStart(12, "0").slice(-12);
  let sum = 0;
  let weight = 3;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${body}${check}`;
}

function dateBack(days: number): Date {
  return new Date(Date.UTC(2026, 0, 1) - days * 86_400_000);
}

async function insertBatches(db: Db, collection: string, docs: unknown[], batch = 5000) {
  for (let i = 0; i < docs.length; i += batch) {
    await db.collection(collection).insertMany(
      docs.slice(i, i + batch) as Record<string, unknown>[],
      { ordered: false },
    );
  }
}

export interface BenchmarkData {
  brandIds: ObjectId[];
  categoryIds: ObjectId[];
  productIds: ObjectId[];
  orgIds: ObjectId[];
  sourceIds: ObjectId[];
  relationshipIds: ObjectId[];
  claimIds: ObjectId[];
  userIds: ObjectId[];
  correctionIds: ObjectId[];
  sampleGtin: string;
}

export async function seedBenchmark(
  db: Db,
  volumes: {
    products?: number;
    brands?: number;
    categories?: number;
    organizations?: number;
    relationships?: number;
    snapshots?: number;
    sources?: number;
    claims?: number;
    corrections?: number;
    auditEvents?: number;
    users?: number;
  } = {},
): Promise<BenchmarkData> {
  const v = {
    products: volumes.products ?? 10_000,
    brands: volumes.brands ?? 500,
    categories: volumes.categories ?? 200,
    organizations: volumes.organizations ?? 1_000,
    relationships: volumes.relationships ?? 50_000,
    snapshots: volumes.snapshots ?? 50_000,
    sources: volumes.sources ?? 5_000,
    claims: volumes.claims ?? 5_000,
    corrections: volumes.corrections ?? 2_000,
    auditEvents: volumes.auditEvents ?? 20_000,
    users: volumes.users ?? 100,
  };

  const now = dateBack(0);
  const brandIds = Array.from({ length: v.brands }, (_, i) => oid(1_000_000 + i));
  const categoryIds = Array.from({ length: v.categories }, (_, i) => oid(2_000_000 + i));
  const orgIds = Array.from({ length: v.organizations }, (_, i) => oid(3_000_000 + i));
  const sourceIds = Array.from({ length: v.sources }, (_, i) => oid(4_000_000 + i));
  const productIds = Array.from({ length: v.products }, (_, i) => oid(5_000_000 + i));
  const userIds = Array.from({ length: v.users }, (_, i) => oid(6_000_000 + i));

  const brands = brandIds.map((id, i) => ({
    _id: id,
    name: `Brand ${i}`,
    normalizedName: `brand ${i}`,
    aliases: [{ value: `B${i}`, normalizedValue: `b${i}` }],
    recordLifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: new Date(now.getTime() - (i % 365) * 86_400_000),
  }));
  const categories = categoryIds.map((id, i) => {
    const parent = i < 20 ? null : categoryIds[Math.floor((i - 20) / 10)];
    const depth = parent ? 1 : 0;
    return {
      _id: id,
      code: `CAT-${i}`,
      name: `Category ${i}`,
      normalizedName: `category ${i}`,
      parentCategoryId: parent ? parent.toString() : null,
      ancestorIds: parent ? [parent.toString()] : [],
      depth,
      sortOrder: i % 50,
      taxonomyVersion: 1,
      recordLifecycle: "ACTIVE",
      schemaVersion: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
  });
  const organizations = orgIds.map((id, i) => ({
    _id: id,
    name: `Organization ${i}`,
    normalizedName: `organization ${i}`,
    kind: i % 2 ? "LEGAL_ENTITY" : "CORPORATE_GROUP",
    aliases: [{ value: `Org${i}`, normalizedValue: `org${i}` }],
    identifiers: [{
      scheme: "REGISTRY",
      value: `REG-${i}`,
      normalizedValue: `reg-${i}`,
      jurisdiction: markets[i % markets.length],
    }],
    operatingCountryCodes: [markets[i % markets.length]],
    internalNotes: [],
    recordLifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));
  const sources = sourceIds.map((id, i) => ({
    _id: id,
    title: `Source ${i}`,
    canonicalUrl: `https://example.com/source/${i}`,
    sourceType: i % 3 === 0 ? "GOVERNMENT_REGISTRY" : "NEWS_ARTICLE",
    access: i % 10 === 0 ? "PAYWALLED" : "PUBLIC",
    language: i % 2 ? "fa" : "en",
    countryCode: markets[i % markets.length],
    lastCapturedAt: new Date(now.getTime() - (i % 100) * 86_400_000),
    recordLifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));

  const sampleGtin = gtin13(123456789);
  const products = productIds.map((id, i) => {
    const brandId = brandIds[i % brandIds.length];
    const categoryId = categoryIds[i % categoryIds.length];
    return {
      _id: id,
      name: `Product ${i}`,
      normalizedName: `product ${i}`,
      identifiers: [{
        scheme: "GTIN_13",
        value: i === 0 ? sampleGtin : gtin13(i),
        normalizedValue: i === 0 ? sampleGtin : gtin13(i),
        jurisdiction: markets[i % markets.length],
        status: i % 50 === 1 ? "UNVERIFIED" : "VERIFIED",
      }],
      brandMapping: { state: "CONFIRMED" },
      packaging: { format: "box", quantity: 1, unit: "unit" },
      brand: {
        _id: brandId,
        name: `Brand ${i % brandIds.length}`,
        normalizedName: `brand ${i % brandIds.length}`,
        recordLifecycle: "ACTIVE",
      },
      category: {
        _id: categoryId,
        code: `CAT-${i % categoryIds.length}`,
        name: `Category ${i % categoryIds.length}`,
        normalizedName: `category ${i % categoryIds.length}`,
        depth: 0,
        taxonomyVersion: 1,
        recordLifecycle: "ACTIVE",
      },
      recordLifecycle: "ACTIVE",
      schemaVersion: 1,
      version: 1,
      createdAt: now,
      updatedAt: new Date(now.getTime() - (i % 400) * 86_400_000),
    };
  });
  const users = userIds.map((id, i) => ({
    _id: id,
    authProvider: "LOCAL",
    authSubject: `subject-${i}`,
    email: `user${i}@example.invalid`,
    displayName: `User ${i}`,
    preferredLocale: i % 2 ? "fa" : "en",
    roles: i === 0 ? ["ADMIN"] : i % 5 === 0 ? ["RESEARCHER"] : ["CONTRIBUTOR"],
    trustLevel: i % 4,
    accountStatus: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));

  await insertBatches(db, "brands", brands);
  await insertBatches(db, "categories", categories);
  await insertBatches(db, "organizations", organizations);
  await insertBatches(db, "sources", sources);
  await insertBatches(db, "products", products);
  await insertBatches(db, "users", users);

  const relationships: Record<string, unknown>[] = [];
  const relationshipIds: ObjectId[] = [];
  for (let i = 0; i < v.relationships; i++) {
    const id = oid(7_000_000 + i);
    relationshipIds.push(id);
    const subjectType = i % 2 ? "organization" : "brand";
    const subjectId = subjectType === "organization"
      ? orgIds[i % orgIds.length]
      : brandIds[i % brandIds.length];
    const objectId = i % 3 === 0 ? productIds[i % productIds.length] : orgIds[i % orgIds.length];
    relationships.push({
      _id: id,
      subject: { type: subjectType, id: subjectId.toString() },
      predicate: predicateList[i % predicateList.length],
      predicateRegistryVersion: 1,
      object: {
        type: i % 3 === 0 ? "product" : "organization",
        id: objectId.toString(),
      },
      context: { marketCountryCode: markets[i % markets.length] },
      validity: {
        validFrom: dateBack((i % 3000) + 30),
        validTo: i % 4 === 0 ? dateBack(i % 800) : null,
      },
      review: {
        status: reviewList[i % reviewList.length],
        assignedTo: i % 2 ? userIds[i % userIds.length].toString() : undefined,
        priority: i % 3,
      },
      assessment: {
        outcome: assessmentList[i % assessmentList.length],
        summary: "Spike assessment",
        assessedBy: userIds[i % userIds.length].toString(),
      },
      publication: {
        status: publicationList[i % publicationList.length],
        visibility: "PUBLIC",
        publishedAt: i % 5 === 2 ? dateBack(i % 100) : undefined,
      },
      evidence: [
        {
          sourceSnapshotId: oid(8_000_000 + (i % v.snapshots)).toString(),
          stance: i % 2 ? "SUPPORTS" : "CONTRADICTS",
          locator: "p. 1",
          excerpt: "Representative excerpt",
        },
        {
          sourceSnapshotId: oid(8_000_000 + ((i + 1) % v.snapshots)).toString(),
          stance: "CONTEXTUALIZES",
          locator: "p. 2",
          excerpt: "Representative context",
        },
      ],
      organizationResponses: i % 10 === 0
        ? [{
          respondingOrganizationId: orgIds[i % orgIds.length].toString(),
          statement: "Representative response",
          receivedAt: dateBack(i % 200),
          authorityVerified: true,
          publication: { status: "PUBLISHED", visibility: "PUBLIC" },
        }]
        : [],
      researchNotes: i % 20 === 0
        ? [{
          body: "Private research note",
          authorId: userIds[i % userIds.length].toString(),
          createdAt: dateBack(i % 100),
          visibility: "INTERNAL",
        }]
        : [],
      recentRevisionPreview: [],
      canonicalKey: `org:${subjectId}:${predicateList[i % predicateList.length]}:org:${objectId}`,
      recordedAt: dateBack(i % 1000),
      recordLifecycle: "ACTIVE",
      schemaVersion: 1,
      version: 1,
      createdAt: now,
      updatedAt: new Date(now.getTime() - (i % 700) * 86_400_000),
    });
  }

  const claims: Record<string, unknown>[] = [];
  const claimIds: ObjectId[] = [];
  for (let i = 0; i < v.claims; i++) {
    const id = oid(9_000_000 + i);
    claimIds.push(id);
    claims.push({
      _id: id,
      about: {
        type: i % 2 ? "organization" : "product",
        id: (i % 2 ? orgIds[i % orgIds.length] : productIds[i % productIds.length]).toString(),
      },
      relatedEntities: [],
      claimType: i % 2 ? "CORPORATE_ACTIVITY" : "PRODUCT_ORIGIN",
      statement: `Claim ${i}`,
      scope: { marketCountryCode: markets[i % markets.length] },
      review: {
        status: reviewList[(i + 2) % reviewList.length],
        assignedTo: i % 2 ? userIds[i % userIds.length].toString() : undefined,
      },
      assessment: { outcome: assessmentList[(i + 1) % assessmentList.length] },
      publication: { status: publicationList[(i + 2) % publicationList.length], visibility: "PUBLIC" },
      evidence: [{
        sourceSnapshotId: oid(8_000_000 + (i % v.snapshots)).toString(),
        stance: "SUPPORTS",
        locator: "p. 3",
        excerpt: "Representative claim excerpt",
      }],
      organizationResponses: [],
      researchNotes: [],
      recordedAt: dateBack(i % 500),
      recordLifecycle: "ACTIVE",
      schemaVersion: 1,
      version: 1,
      createdAt: now,
      updatedAt: new Date(now.getTime() - (i % 300) * 86_400_000),
    });
  }

  const snapshots: Record<string, unknown>[] = [];
  for (let i = 0; i < v.snapshots; i++) {
    const id = oid(8_000_000 + i);
    const sourceId = sourceIds[i % sourceIds.length];
    snapshots.push({
      _id: id,
      titleAtCapture: `Source ${i % sourceIds.length}`,
      canonicalUrlAtCapture: `https://example.com/source/${i % sourceIds.length}`,
      retrievedAt: dateBack(i % 2000),
      contentHash: `hash-${i}`,
      hashAlgorithm: "SHA-256",
      mimeType: "text/html",
      byteSize: 1024 + (i % 5000),
      assetId: null,
      captureMethod: "URL_FETCH",
      acquisitionTier: "PRIMARY",
      source: {
        _id: sourceId,
        title: `Source ${i % sourceIds.length}`,
        canonicalUrl: `https://example.com/source/${i % sourceIds.length}`,
        sourceType: "NEWS_ARTICLE",
        access: "PUBLIC",
        recordLifecycle: "ACTIVE",
      },
      recordLifecycle: "ACTIVE",
      schemaVersion: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  const corrections: Record<string, unknown>[] = [];
  const correctionIds: ObjectId[] = [];
  for (let i = 0; i < v.corrections; i++) {
    const id = oid(10_000_000 + i);
    correctionIds.push(id);
    const productId = productIds[i % productIds.length];
    corrections.push({
      _id: id,
      target: { type: "product", id: productId.toString() },
      submissionKind: "CORRECTION",
      proposedChange: {
        fieldKey: "name",
        operation: "SET",
        proposedValue: `Corrected product ${i}`,
      },
      reason: "Representative correction",
      submittedBy: userIds[i % userIds.length].toString(),
      submittedAt: dateBack(i % 300),
      status: ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "APPLIED", "REJECTED"][i % 5],
      review: {
        status: reviewList[(i + 3) % reviewList.length],
        assignedTo: i % 2 ? userIds[i % userIds.length].toString() : undefined,
      },
      recordLifecycle: "ACTIVE",
      schemaVersion: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  const auditEvents: Record<string, unknown>[] = [];
  for (let i = 0; i < v.auditEvents; i++) {
    const targetKind = i % 3 === 0 ? "product" : "organization";
    auditEvents.push({
      _id: oid(11_000_000 + i),
      eventSchemaVersion: 1,
      actor: { type: "user", id: userIds[i % userIds.length].toString() },
      action: "UPDATE",
      target: {
        type: targetKind,
        id: (targetKind === "product"
          ? productIds[i % productIds.length]
          : orgIds[i % orgIds.length]).toString(),
      },
      requestId: `req-${Math.floor(i / 10)}`,
      correlationId: `corr-${Math.floor(i / 50)}`,
      targetVersionBefore: 1,
      targetVersionAfter: 2,
      changedPaths: ["name"],
      beforeSummary: { name: "old" },
      afterSummary: { name: "new" },
      occurredAt: dateBack(i % 1000),
      schemaVersion: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  await insertBatches(db, "relationships", relationships);
  await insertBatches(db, "claims", claims);
  await insertBatches(db, "source_snapshots", snapshots);
  await insertBatches(db, "corrections", corrections);
  await insertBatches(db, "audit_events", auditEvents);
  await createSpikeIndexes(db);

  return {
    brandIds,
    categoryIds,
    productIds,
    orgIds,
    sourceIds,
    relationshipIds,
    claimIds,
    userIds,
    correctionIds,
    sampleGtin,
  };
}

export interface ExplainStats {
  indexName: string | null;
  stage: string | null;
  collectionScan: boolean;
  executionTimeMillis: number;
  totalDocsExamined: number;
  totalKeysExamined: number;
  nReturned: number;
}

function findIndexName(plan: any): string | null {
  if (!plan || typeof plan !== "object") return null;
  if (typeof plan.indexName === "string") return plan.indexName;
  for (const value of Object.values(plan)) {
    const found = findIndexName(value);
    if (found) return found;
  }
  return null;
}

function findStage(plan: any): string | null {
  if (!plan || typeof plan !== "object") return null;
  if (typeof plan.stage === "string") return plan.stage;
  for (const value of Object.values(plan)) {
    const found = findStage(value);
    if (found) return found;
  }
  return null;
}

export async function explainStats(cursor: {
  explain: (verbosity: "executionStats") => Promise<unknown>;
}): Promise<ExplainStats> {
  const plan = await cursor.explain("executionStats") as any;
  const executionStats = plan.executionStats ?? {};
  const winning = plan.queryPlanner?.winningPlan ?? plan.winningPlan ?? {};
  return {
    indexName: findIndexName(winning),
    stage: findStage(winning),
    collectionScan: JSON.stringify(winning).includes('"COLLSCAN"'),
    executionTimeMillis: executionStats.executionTimeMillis ?? 0,
    totalDocsExamined: executionStats.totalDocsExamined ?? 0,
    totalKeysExamined: executionStats.totalKeysExamined ?? 0,
    nReturned: executionStats.nReturned ?? 0,
  };
}

export interface LatencyStats {
  p50: number;
  p95: number;
  min: number;
  max: number;
  runs: number;
}

export async function measureLatency(
  fn: () => Promise<unknown>,
  runs = 30,
): Promise<LatencyStats> {
  for (let i = 0; i < 3; i++) await fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    p50: samples[Math.floor(samples.length * 0.5)],
    p95: samples[Math.floor(samples.length * 0.95)],
    min: samples[0],
    max: samples[samples.length - 1],
    runs,
  };
}

export function representativeRelationshipSize() {
  const doc = {
    _id: new ObjectId(),
    subject: { type: "organization", id: new ObjectId().toString() },
    predicate: "MANUFACTURES",
    object: { type: "product", id: new ObjectId().toString() },
    context: { marketCountryCode: "IR" },
    validity: { validFrom: new Date(), validTo: null },
    review: { status: "CLOSED", assignedTo: new ObjectId().toString() },
    assessment: { outcome: "SUPPORTED", summary: "A".repeat(400) },
    publication: { status: "PUBLISHED", visibility: "PUBLIC" },
    evidence: Array.from({ length: 10 }, () => ({
      sourceSnapshotId: new ObjectId().toString(),
      stance: "SUPPORTS",
      locator: "p. 1",
      excerpt: "E".repeat(500),
      rationale: "R".repeat(500),
    })),
    organizationResponses: Array.from({ length: 5 }, () => ({
      respondingOrganizationId: new ObjectId().toString(),
      statement: "S".repeat(1000),
      receivedAt: new Date(),
      authorityVerified: true,
    })),
    researchNotes: Array.from({ length: 5 }, () => ({
      body: "N".repeat(1000),
      authorId: new ObjectId().toString(),
      createdAt: new Date(),
      visibility: "INTERNAL",
    })),
    recentRevisionPreview: Array.from({ length: 5 }, () => ({
      version: 1,
      changedPaths: ["assessment.outcome"],
      changedAt: new Date(),
    })),
    canonicalKey: "org:x:MANUFACTURES:product:y",
    recordedAt: new Date(),
  };
  return BSON.calculateObjectSize(doc);
}

export function largeRelationshipSize(evidenceCount: number) {
  const doc = {
    _id: new ObjectId(),
    evidence: Array.from({ length: evidenceCount }, () => ({
      sourceSnapshotId: new ObjectId().toString(),
      stance: "SUPPORTS",
      excerpt: "E".repeat(500),
      rationale: "R".repeat(500),
    })),
  };
  return BSON.calculateObjectSize(doc);
}
