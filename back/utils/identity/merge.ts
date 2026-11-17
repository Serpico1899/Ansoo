// Merge and unmerge identity records. Spec 4.6, 5, 16.1, and I15.
//
// Merge writes a tombstone on the source, follows the target chain, enforces
// CAS, appends an AuditEvent, and never touches documents that reference the
// old identity. Unmerge is rare, explicit, and audited.
import type { ClientSession, Db, MongoClient } from "lesan";
import { ObjectId } from "lesan";
import { ENTITY_COLLECTION, type EntityType } from "../domain/constants.ts";
import { createEntityRegistry } from "./registry.ts";

export type MergeActor = {
  type: "USER" | "SYSTEM" | "SERVICE";
  id?: ObjectId;
};

export class MergeError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "SOURCE_NOT_FOUND"
      | "TARGET_NOT_FOUND"
      | "SELF_MERGE"
      | "VERSION_CONFLICT"
      | "CONTRADICTORY_IDENTIFIERS"
      | "NOT_MERGED"
      | "ALREADY_MERGED"
      | "MISSING_MERGE_TARGET",
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "MergeError";
  }
}

const MERGE_ROLES = ["MODERATOR", "ADMIN"] as const;
const MERGEABLE_TYPES: readonly EntityType[] = ["PRODUCT", "BRAND", "ORGANIZATION"];

async function assertMergeAuthorized(db: Db, actor: MergeActor): Promise<void> {
  if (actor.type !== "USER") return;
  if (!actor.id) {
    throw new MergeError("FORBIDDEN", "user actor requires an id", 403);
  }
  const user = await db.collection("users").findOne({ _id: actor.id });
  if (!user || user.accountStatus !== "ACTIVE") {
    throw new MergeError("FORBIDDEN", "actor is not an active user", 403);
  }
  const roles = Array.isArray(user.roles) ? user.roles as string[] : [];
  if (!MERGE_ROLES.some((role) => roles.includes(role))) {
    throw new MergeError("FORBIDDEN", "actor may not merge identities", 403);
  }
}

function verifiedIdentifierMap(doc: Record<string, unknown>): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const identifiers = Array.isArray(doc.identifiers) ? doc.identifiers : [];
  for (const item of identifiers) {
    if (item === null || typeof item !== "object") continue;
    const identifier = item as Record<string, unknown>;
    if (identifier.status !== "VERIFIED") continue;
    if (typeof identifier.scheme !== "string" || typeof identifier.normalizedValue !== "string") {
      continue;
    }
    const values = result.get(identifier.scheme) ?? new Set<string>();
    values.add(identifier.normalizedValue);
    result.set(identifier.scheme, values);
  }
  return result;
}

function assertNoContradictoryIdentifiers(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
): void {
  const left = verifiedIdentifierMap(source);
  const right = verifiedIdentifierMap(target);
  for (const [scheme, values] of left) {
    const other = right.get(scheme);
    if (!other) continue;
    if (![...values].some((value) => other.has(value))) {
      throw new MergeError(
        "CONTRADICTORY_IDENTIFIERS",
        `verified ${scheme} identifiers do not overlap`,
      );
    }
  }
}

function auditBase(
  action: "ENTITY_MERGED" | "ENTITY_UNMERGED",
  entityType: EntityType,
  sourceId: ObjectId,
  actor: MergeActor,
  now: Date,
  reason: string,
  targetVersionBefore: number,
  beforeSummary: Record<string, string | number | boolean>,
  afterSummary: Record<string, string | number | boolean>,
  changedPaths: string[],
) {
  return {
    _id: new ObjectId(),
    eventSchemaVersion: 1,
    actor: actor.id ? { type: actor.type, id: actor.id } : { type: actor.type },
    action,
    target: { type: entityType, id: sourceId },
    targetVersionBefore,
    targetVersionAfter: targetVersionBefore + 1,
    beforeSummary,
    afterSummary,
    changedPaths,
    reason,
    occurredAt: now,
  };
}

export async function mergeEntity(input: {
  db: Db;
  client?: MongoClient;
  entityType: EntityType;
  sourceId: ObjectId;
  targetId: ObjectId;
  expectedVersion: number;
  reason: string;
  actor: MergeActor;
  now?: Date;
}): Promise<{ survivorId: ObjectId; mergedId: ObjectId; auditIds: ObjectId[] }> {
  const { db, entityType, sourceId, targetId, reason, actor } = input;
  const now = input.now ?? new Date();

  if (!MERGEABLE_TYPES.includes(entityType)) {
    throw new MergeError("TARGET_NOT_FOUND", `${entityType} is not mergeable`);
  }
  if (sourceId.equals(targetId)) {
    throw new MergeError("SELF_MERGE", "an identity cannot merge into itself");
  }
  await assertMergeAuthorized(db, actor);

  const collection = ENTITY_COLLECTION[entityType];
  const source = await db.collection(collection).findOne({ _id: sourceId });
  if (!source) throw new MergeError("SOURCE_NOT_FOUND", "source identity does not exist");
  if (source.lifecycle === "MERGED") {
    throw new MergeError("ALREADY_MERGED", "source identity is already merged");
  }

  const registry = createEntityRegistry(db);
  let survivor: Record<string, unknown> & { _id: ObjectId };
  try {
    const resolved = await registry.resolve("audit.target", { type: entityType, id: targetId });
    survivor = resolved.doc;
  } catch {
    throw new MergeError("TARGET_NOT_FOUND", "merge target does not exist or is not live");
  }
  if (survivor._id.equals(sourceId)) {
    throw new MergeError("SELF_MERGE", "merge target resolves back to the source");
  }
  if (survivor.lifecycle !== "ACTIVE") {
    throw new MergeError("TARGET_NOT_FOUND", "merge target is not active");
  }
  assertNoContradictoryIdentifiers(source, survivor);

  const audit = auditBase(
    "ENTITY_MERGED",
    entityType,
    sourceId,
    actor,
    now,
    reason,
    input.expectedVersion,
    { lifecycle: String(source.lifecycle), version: input.expectedVersion },
    { lifecycle: "MERGED", mergedIntoId: survivor._id.toString() },
    ["lifecycle", "mergedIntoId", "mergedAt", "mergedBy", "mergeReason"],
  );

  const run = async (session?: ClientSession) => {
    const options = session ? { session } : {};
    const updated = await db.collection(collection).updateOne(
      { _id: sourceId, version: input.expectedVersion, lifecycle: { $ne: "MERGED" } },
      {
        $set: {
          lifecycle: "MERGED",
          mergedIntoId: survivor._id,
          mergedAt: now,
          mergedBy: actor.id,
          mergeReason: reason,
          updatedAt: now,
          ...(actor.id ? { updatedBy: actor.id } : {}),
        },
        $inc: { version: 1 },
      },
      options,
    );
    if (updated.modifiedCount !== 1) {
      throw new MergeError("VERSION_CONFLICT", "source version did not match");
    }
    await db.collection("audit_events").insertOne(audit, options);
  };

  if (input.client) {
    const session = input.client.startSession();
    try {
      await session.withTransaction(() => run(session));
    } finally {
      await session.endSession();
    }
  } else {
    await run();
  }

  return { survivorId: survivor._id, mergedId: sourceId, auditIds: [audit._id] };
}

export async function unmergeEntity(input: {
  db: Db;
  client?: MongoClient;
  entityType: EntityType;
  sourceId: ObjectId;
  expectedVersion: number;
  reason: string;
  actor: MergeActor;
  now?: Date;
}): Promise<{ restoredId: ObjectId; auditIds: ObjectId[] }> {
  const { db, entityType, sourceId, reason, actor } = input;
  const now = input.now ?? new Date();
  if (!MERGEABLE_TYPES.includes(entityType)) {
    throw new MergeError("NOT_MERGED", `${entityType} is not mergeable`);
  }
  await assertMergeAuthorized(db, actor);
  const collection = ENTITY_COLLECTION[entityType];
  const source = await db.collection(collection).findOne({ _id: sourceId });
  if (!source) throw new MergeError("SOURCE_NOT_FOUND", "source identity does not exist");
  if (source.lifecycle !== "MERGED" || !source.mergedIntoId) {
    throw new MergeError("NOT_MERGED", "source is not merged");
  }

  const audit = auditBase(
    "ENTITY_UNMERGED",
    entityType,
    sourceId,
    actor,
    now,
    reason,
    input.expectedVersion,
    { lifecycle: "MERGED", mergedIntoId: source.mergedIntoId.toString() },
    { lifecycle: "ACTIVE" },
    ["lifecycle", "mergedIntoId", "mergedAt", "mergedBy", "mergeReason"],
  );

  const run = async (session?: ClientSession) => {
    const options = session ? { session } : {};
    const updated = await db.collection(collection).updateOne(
      { _id: sourceId, version: input.expectedVersion, lifecycle: "MERGED" },
      {
        $set: { lifecycle: "ACTIVE", updatedAt: now, ...(actor.id ? { updatedBy: actor.id } : {}) },
        $unset: { mergedIntoId: "", mergedAt: "", mergedBy: "", mergeReason: "" },
        $inc: { version: 1 },
      },
      options,
    );
    if (updated.modifiedCount !== 1) {
      throw new MergeError("VERSION_CONFLICT", "source version did not match");
    }
    await db.collection("audit_events").insertOne(audit, options);
  };

  if (input.client) {
    const session = input.client.startSession();
    try {
      await session.withTransaction(() => run(session));
    } finally {
      await session.endSession();
    }
  } else {
    await run();
  }
  return { restoredId: sourceId, auditIds: [audit._id] };
}
