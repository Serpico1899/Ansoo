// Rebuildable public profile read model. Spec 14.4, S24, S30.
//
// The collection is technical and derived. It is never a source of truth and
// accepts no client writes. Rebuilds always read canonical collections only.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { type ResolutionResult, resolveProduct } from "../identity/resolution.ts";
import { createEntityRegistry } from "../identity/registry.ts";
import {
  assemblePublicProfile,
  type AssemblyResult,
  sourceVersionOf,
  stableStringify,
} from "./assemble.ts";
import {
  PUBLIC_PROFILE_SCHEMA_VERSION,
  type PublicProductProfile,
  type PublicSourceVersions,
} from "./types.ts";

export const READ_MODEL_COLLECTION = "product_public_profiles";
export const REBUILD_QUEUE_COLLECTION = "public_profile_rebuild_queue";

export type PublicProfileRecord = {
  _id: ObjectId;
  productId: ObjectId;
  schemaVersion: number;
  payload: PublicProductProfile;
  sourceVersions: PublicSourceVersions;
  sourceHash: string;
  builtAt: Date;
};

export type RebuildSummary = {
  scanned: number;
  rebuilt: number;
  failed: number;
  queueDepth: number;
};

export class ReadModelError extends Error {
  constructor(readonly code: "PRODUCT_NOT_FOUND" | "REBUILD_FAILED", message: string) {
    super(message);
    this.name = "ReadModelError";
  }
}

function stableProfile(value: unknown): string {
  return stableStringify(value);
}

export function profileRecordId(productId: ObjectId): ObjectId {
  return productId;
}

function recordFrom(
  productId: ObjectId,
  result: AssemblyResult,
  now: Date,
): PublicProfileRecord {
  const payload: PublicProductProfile = result.profile;
  return {
    _id: profileRecordId(productId),
    productId,
    schemaVersion: PUBLIC_PROFILE_SCHEMA_VERSION,
    payload,
    sourceVersions: result.sourceVersions,
    sourceHash: stableProfile(result.sourceVersions),
    builtAt: now,
  };
}

export async function buildProfileForProduct(input: {
  db: Db;
  productId: ObjectId;
  now?: Date;
  resolution?: ResolutionResult;
}): Promise<PublicProfileRecord> {
  const now = input.now ?? new Date();
  const resolution = input.resolution ??
    { state: "FOUND", productId: input.productId, confidence: "EXACT" } as const;
  const result = await assemblePublicProfile({
    db: input.db,
    resolution,
    now,
  });
  if (result.profile.product === undefined && resolution.state === "FOUND") {
    throw new ReadModelError("PRODUCT_NOT_FOUND", "product does not exist");
  }
  return recordFrom(input.productId, result, now);
}

export async function writeProfileRecord(
  db: Db,
  record: PublicProfileRecord,
): Promise<void> {
  await db.collection(READ_MODEL_COLLECTION).replaceOne(
    { _id: record._id },
    record,
    { upsert: true },
  );
}

export async function rebuildProfile(
  input: { db: Db; productId: ObjectId; now?: Date; resolution?: ResolutionResult },
): Promise<PublicProfileRecord> {
  const record = await buildProfileForProduct(input);
  await writeProfileRecord(input.db, record);
  return record;
}

export async function getProfileRecord(
  db: Db,
  productId: ObjectId,
): Promise<PublicProfileRecord | null> {
  const doc = await db.collection(READ_MODEL_COLLECTION).findOne({ _id: productId });
  return doc as PublicProfileRecord | null;
}

export async function isProfileStale(
  db: Db,
  record: PublicProfileRecord,
): Promise<boolean> {
  const grouped = new Map<string, ObjectId[]>();
  for (const key of Object.keys(record.sourceVersions)) {
    const separator = key.indexOf(":");
    if (separator < 0) continue;
    const collection = key.slice(0, separator);
    const id = key.slice(separator + 1);
    if (!/^[a-f0-9]{24}$/i.test(id)) continue;
    const ids = grouped.get(collection) ?? [];
    ids.push(new ObjectId(id));
    grouped.set(collection, ids);
  }
  for (const [collection, ids] of grouped) {
    const docs = await db.collection(collection).find({
      _id: { $in: ids },
    }, {
      projection: {
        _id: 1,
        version: 1,
        updatedAt: 1,
        createdAt: 1,
        retrievedAt: 1,
        recordedAt: 1,
        contentHash: 1,
      },
    }).toArray();
    const current = new Map<string, string>();
    for (const doc of docs) {
      current.set(`${collection}:${(doc._id as ObjectId).toString()}`, sourceVersionOf(doc));
    }
    for (const id of ids) {
      const key = `${collection}:${id.toString()}`;
      const expected = record.sourceVersions[key];
      if (current.get(key) !== expected) return true;
    }
  }
  return false;
}

export async function getFreshProfile(
  input: { db: Db; productId: ObjectId; now?: Date },
): Promise<{ record: PublicProfileRecord; rebuilt: boolean }> {
  const existing = await getProfileRecord(input.db, input.productId);
  if (existing !== null) {
    const queued = await input.db.collection(REBUILD_QUEUE_COLLECTION).countDocuments({
      productId: input.productId,
      status: "PENDING",
    });
    if (queued === 0 && !(await isProfileStale(input.db, existing))) {
      return { record: existing, rebuilt: false };
    }
  }
  const record = await rebuildProfile(input);
  await input.db.collection(REBUILD_QUEUE_COLLECTION).updateMany(
    { productId: input.productId, status: "PENDING" },
    { $set: { status: "DONE", completedAt: input.now ?? new Date() } },
  );
  return { record, rebuilt: true };
}

export async function listProductIds(db: Db): Promise<ObjectId[]> {
  const docs = await db.collection("products").find({
    lifecycle: { $in: ["ACTIVE", "MERGED"] },
  }, { projection: { _id: 1 } }).sort({ _id: 1 }).toArray();
  return docs.map((doc) => doc._id as ObjectId);
}

export async function rebuildAllProfiles(input: {
  db: Db;
  now?: Date;
}): Promise<RebuildSummary> {
  const now = input.now ?? new Date();
  const ids = await listProductIds(input.db);
  let rebuilt = 0;
  let failed = 0;
  for (const productId of ids) {
    try {
      await rebuildProfile({ db: input.db, productId, now });
      rebuilt++;
    } catch {
      failed++;
    }
  }
  const queueDepth = await input.db.collection(REBUILD_QUEUE_COLLECTION).countDocuments({
    status: "PENDING",
  });
  return { scanned: ids.length, rebuilt, failed, queueDepth };
}

export function profilePayload(record: PublicProfileRecord | null): PublicProductProfile | null {
  return record === null ? null : record.payload;
}

export function isRecordForProduct(
  record: PublicProfileRecord,
  productId: ObjectId,
): boolean {
  return record.productId.equals(productId) && record._id.equals(productId);
}

export type RebuildRequest = {
  productId: ObjectId;
  reason: string;
  requestedAt: Date;
};

export async function requestProfileRebuild(
  db: Db,
  requests: readonly RebuildRequest[],
): Promise<void> {
  for (const request of requests) {
    await db.collection(REBUILD_QUEUE_COLLECTION).updateOne(
      { productId: request.productId, status: "PENDING" },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          productId: request.productId,
          status: "PENDING",
          attempts: 0,
          requestedAt: request.requestedAt,
        },
        $set: {
          lastRequestedAt: request.requestedAt,
          reason: request.reason,
        },
      },
      { upsert: true },
    );
  }
}

export async function profileIdsForFinding(
  db: Db,
  _targetType: "CLAIM" | "RELATIONSHIP",
  targetId: ObjectId,
): Promise<ObjectId[]> {
  const docs = await db.collection(READ_MODEL_COLLECTION).find({
    $or: [
      { "payload.findings.findingId": targetId },
      { "findings.findingId": targetId },
      { "payload.findings.id": targetId },
      { "findings.id": targetId },
      { "claims.findingId": targetId },
      { "claims.id": targetId },
      { "relationships.findingId": targetId },
      { "relationships.id": targetId },
      { findingIds: targetId },
    ],
  }, { projection: { productId: 1 } }).toArray();
  return docs.map((doc) => doc.productId as ObjectId).filter((id) => id instanceof ObjectId);
}

export async function productIdsForEntity(
  db: Db,
  entityType: "PRODUCT" | "BRAND" | "ORGANIZATION",
  entityId: ObjectId,
): Promise<ObjectId[]> {
  if (entityType === "PRODUCT") return [entityId];
  if (entityType === "BRAND") {
    const products = await db.collection("products").find({
      "brand._id": entityId,
      lifecycle: { $in: ["ACTIVE", "MERGED"] },
    }, { projection: { _id: 1 } }).toArray();
    return products.map((product) => product._id as ObjectId);
  }
  const edges = await db.collection("relationships").find({
    $or: [
      { "subject.type": "ORGANIZATION", "subject.id": entityId },
      { "object.type": "ORGANIZATION", "object.id": entityId },
    ],
    "publication.status": "PUBLISHED",
    recordLifecycle: "ACTIVE",
  }).limit(100).toArray();
  const brandIds = new Set<string>();
  for (const edge of edges) {
    for (const end of [edge.subject, edge.object]) {
      if (end?.type === "BRAND" && end.id instanceof ObjectId) brandIds.add(end.id.toString());
    }
  }
  const productIds: ObjectId[] = [];
  for (const brandId of brandIds) {
    productIds.push(...await productIdsForEntity(db, "BRAND", new ObjectId(brandId)));
  }
  return dedupeIds(productIds);
}

function dedupeIds(ids: ObjectId[]): ObjectId[] {
  const seen = new Set<string>();
  return ids.filter((id) => {
    const key = id.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function requestRebuildsForFinding(input: {
  db: Db;
  targetType: "CLAIM" | "RELATIONSHIP";
  targetId: ObjectId;
  reason: string;
  now?: Date;
}): Promise<ObjectId[]> {
  const collection = input.targetType === "CLAIM" ? "claims" : "relationships";
  const doc = await input.db.collection(collection).findOne({ _id: input.targetId });
  const now = input.now ?? new Date();
  if (!doc) return [];
  const productIds: ObjectId[] = [];
  if (input.targetType === "CLAIM") {
    const about = (doc.about ?? {}) as Record<string, unknown>;
    if (
      (about.type === "PRODUCT" || about.type === "BRAND" || about.type === "ORGANIZATION") &&
      about.id instanceof ObjectId
    ) {
      productIds.push(...await productIdsForEntity(input.db, about.type, about.id));
    }
    if (about.type === "RELATIONSHIP" && about.id instanceof ObjectId) {
      const relationship = await input.db.collection("relationships").findOne({ _id: about.id });
      if (relationship) {
        for (const end of [relationship.subject, relationship.object]) {
          if (
            end?.id instanceof ObjectId &&
            (end.type === "PRODUCT" || end.type === "BRAND" || end.type === "ORGANIZATION")
          ) {
            productIds.push(...await productIdsForEntity(input.db, end.type, end.id));
          }
        }
      }
    }
  } else {
    for (const end of [doc.subject, doc.object]) {
      if (
        end?.id instanceof ObjectId &&
        (end.type === "PRODUCT" || end.type === "BRAND" || end.type === "ORGANIZATION")
      ) {
        productIds.push(...await productIdsForEntity(input.db, end.type, end.id));
      }
    }
  }
  const unique = dedupeIds(productIds);
  await requestProfileRebuild(
    input.db,
    unique.map((productId) => ({ productId, reason: input.reason, requestedAt: now })),
  );
  return unique;
}

export async function requestRebuildsForEntity(input: {
  db: Db;
  entityType: "PRODUCT" | "BRAND" | "ORGANIZATION";
  entityId: ObjectId;
  reason: string;
  now?: Date;
}): Promise<ObjectId[]> {
  const ids = await productIdsForEntity(input.db, input.entityType, input.entityId);
  const now = input.now ?? new Date();
  await requestProfileRebuild(
    input.db,
    ids.map((productId) => ({ productId, reason: input.reason, requestedAt: now })),
  );
  return ids;
}

export async function repairPublicProfiles(input: {
  db: Db;
  now?: Date;
  limit?: number;
}): Promise<{ repaired: number; failed: number; queueDepth: number }> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 100;
  const queue = await input.db.collection(REBUILD_QUEUE_COLLECTION).find({
    status: "PENDING",
  }).sort({ requestedAt: 1 }).limit(limit).toArray();
  let repaired = 0;
  let failed = 0;
  for (const entry of queue) {
    const productId = entry.productId as ObjectId;
    try {
      await rebuildProfile({ db: input.db, productId, now });
      await input.db.collection(REBUILD_QUEUE_COLLECTION).updateOne(
        { _id: entry._id },
        { $set: { status: "DONE", completedAt: now } },
      );
      repaired++;
    } catch (error) {
      failed++;
      await input.db.collection(REBUILD_QUEUE_COLLECTION).updateOne(
        { _id: entry._id },
        {
          $inc: { attempts: 1 },
          $set: {
            status: "PENDING",
            lastError: error instanceof Error ? error.message : String(error),
            lastAttemptAt: now,
          },
        },
      );
    }
  }
  const queueDepth = await input.db.collection(REBUILD_QUEUE_COLLECTION).countDocuments({
    status: "PENDING",
  });
  return { repaired, failed, queueDepth };
}

export async function ensureReadModelIndexes(db: Db): Promise<void> {
  await db.collection(READ_MODEL_COLLECTION).createIndexes([
    { key: { productId: 1 }, name: "product_public_profiles_productId", unique: true },
    { key: { "payload.findings.findingId": 1 }, name: "product_public_profiles_finding" },
  ]);
  await db.collection(REBUILD_QUEUE_COLLECTION).createIndexes([
    { key: { status: 1, requestedAt: 1 }, name: "public_profile_rebuild_queue_status" },
    { key: { productId: 1, status: 1 }, name: "public_profile_rebuild_queue_product" },
  ]);
}

export async function resolveProfileLookup(input: {
  db: Db;
  id?: string;
  gtin?: string;
  scheme?: string;
  value?: string;
  jurisdiction?: string;
  issuer?: string;
}): Promise<ResolutionResult> {
  if (input.id !== undefined) {
    const registry = createEntityRegistry(input.db);
    try {
      const resolved = await registry.resolve("audit.target", {
        type: "PRODUCT",
        id: new ObjectId(input.id),
      });
      const identifiers = Array.isArray(resolved.doc.identifiers)
        ? resolved.doc.identifiers as Record<string, unknown>[]
        : [];
      if (identifiers.some((identifier) => identifier.status === "DISPUTED")) {
        return {
          state: "DISPUTED",
          productId: resolved.doc._id,
          disputeNote: "identifier status is DISPUTED",
        };
      }
      if (
        !identifiers.some((identifier) => identifier.status === "VERIFIED") &&
        identifiers.some((identifier) => identifier.status === "UNVERIFIED")
      ) {
        return { state: "UNVERIFIED", productId: resolved.doc._id };
      }
      return {
        state: "FOUND",
        productId: resolved.doc._id,
        confidence: "EXACT",
      };
    } catch {
      return { state: "NOT_FOUND" };
    }
  }
  if (input.gtin !== undefined) {
    return await resolveProduct({ db: input.db, scheme: "GTIN", value: input.gtin });
  }
  if (input.scheme !== undefined && input.value !== undefined) {
    return await resolveProduct({
      db: input.db,
      scheme: input.scheme,
      value: input.value,
      ...(input.jurisdiction === undefined ? {} : { jurisdiction: input.jurisdiction }),
      ...(input.issuer === undefined ? {} : { issuer: input.issuer }),
    });
  }
  return { state: "NOT_FOUND" };
}
