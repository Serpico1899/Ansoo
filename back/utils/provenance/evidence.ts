// EvidenceLink lifecycle for Claims and Relationships. Spec 10.1, 18.3.
//
// A link is pinned to an immutable snapshot. Restricted or internal sources
// may not be cited as published evidence. Adds are commutative appends with a
// cap guard; removals and reviews are compare-and-set.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { assertCharacterCap } from "../domain/caps.ts";
import { EVIDENCE_STANCES, HARD_CAPS } from "../domain/constants.ts";
import { createEntityRegistry } from "../identity/registry.ts";
import { validateClaim } from "../../models/claim.ts";
import { validateRelationship } from "../../models/relationship.ts";
import { requestRebuildsForFinding } from "../publicProfile/readModel.ts";
import {
  appendAudit,
  assertNoUnknownKeys,
  EDIT_ROLES,
  getDocument,
  parseObjectId,
  type ProvenanceActor,
  ProvenanceError,
  requireRoles,
  requireString,
  REVIEW_ROLES,
} from "./common.ts";

type EvidenceDoc = Record<string, unknown> & { _id: ObjectId };
type TargetType = "CLAIM" | "RELATIONSHIP";

const COLLECTIONS: Record<TargetType, string> = {
  CLAIM: "claims",
  RELATIONSHIP: "relationships",
};
const EDITABLE_LABEL: Record<TargetType, string> = {
  CLAIM: "CLAIM_NOT_EDITABLE",
  RELATIONSHIP: "RELATIONSHIP_NOT_EDITABLE",
};

const ADD_KEYS = [
  "db",
  "targetType",
  "targetId",
  "snapshotId",
  "stance",
  "locator",
  "excerpt",
  "rationale",
  "actor",
  "expectedVersion",
  "now",
] as const;
const REMOVE_KEYS = [
  "db",
  "targetType",
  "targetId",
  "evidenceId",
  "actor",
  "expectedVersion",
  "reason",
  "now",
] as const;
const REVIEW_KEYS = [
  "db",
  "targetType",
  "targetId",
  "evidenceId",
  "stance",
  "actor",
  "expectedVersion",
  "note",
  "now",
] as const;
const LOCATOR_KEYS = ["page", "section", "paragraph", "timestamp", "urlFragment"] as const;

function statusOf(doc: Record<string, unknown>): string {
  return String(doc.recordLifecycle ?? doc.lifecycle ?? "");
}

function validateTarget(type: TargetType, doc: EvidenceDoc): void {
  try {
    if (type === "CLAIM") validateClaim(doc);
    else validateRelationship(doc);
  } catch (error) {
    const candidate = error as { code?: string; message?: string; status?: number };
    if (candidate.code) {
      throw new ProvenanceError(
        candidate.code,
        candidate.message ?? candidate.code,
        candidate.status ?? 422,
      );
    }
    throw error;
  }
}

async function loadTarget(db: Db, type: TargetType, id: ObjectId): Promise<EvidenceDoc> {
  const doc = await getDocument(db, COLLECTIONS[type], id, type.toLowerCase());
  if (statusOf(doc) === "ARCHIVED" || statusOf(doc) === "MERGED") {
    throw new ProvenanceError(EDITABLE_LABEL[type], `${type.toLowerCase()} is not editable`, 409);
  }
  return doc;
}

function assertVersion(target: EvidenceDoc, expectedVersion: number, type: TargetType): number {
  const version = Number(target.version ?? 0);
  if (!Number.isInteger(expectedVersion) || version !== expectedVersion) {
    throw new ProvenanceError(
      "VERSION_CONFLICT",
      `${type.toLowerCase()} version did not match`,
      409,
    );
  }
  return version;
}

function locatorOf(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  assertNoUnknownKeys(value, LOCATOR_KEYS, "INVALID_EVIDENCE_LOCATOR", "locator");
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProvenanceError("INVALID_EVIDENCE_LOCATOR", "locator must be an object");
  }
  const input = value as Record<string, unknown>;
  if (input.page !== undefined && (!Number.isInteger(input.page) || Number(input.page) < 1)) {
    throw new ProvenanceError(
      "INVALID_EVIDENCE_LOCATOR",
      "locator.page must be a positive integer",
    );
  }
  for (const key of ["section", "paragraph", "timestamp", "urlFragment"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "string") {
      throw new ProvenanceError("INVALID_EVIDENCE_LOCATOR", `locator.${key} must be a string`);
    }
  }
  return input;
}

async function assertCitableSnapshot(db: Db, snapshotId: ObjectId): Promise<void> {
  const registry = createEntityRegistry(db);
  const resolved = await registry.resolve("evidence.sourceSnapshotId", {
    type: "SOURCE_SNAPSHOT",
    id: snapshotId,
  });
  if (resolved.doc.lifecycle !== "AVAILABLE") {
    throw new ProvenanceError(
      "SNAPSHOT_NOT_AVAILABLE",
      "snapshot is not available for citation",
      409,
    );
  }
  const source = resolved.doc.source as Record<string, unknown> | undefined;
  if (!source?._id) {
    throw new ProvenanceError("INVALID_SNAPSHOT", "snapshot has no source", 409);
  }
  const sourceDoc = await getDocument(db, "sources", source._id as ObjectId, "source");
  if (sourceDoc.lifecycle === "ARCHIVED") {
    throw new ProvenanceError("SOURCE_ARCHIVED", "source is archived", 409);
  }
  if (sourceDoc.access === "RESTRICTED" || sourceDoc.access === "INTERNAL") {
    throw new ProvenanceError(
      "RESTRICTED_CITATION",
      "restricted or internal sources cannot be cited as published evidence",
      422,
      { sourceAccess: String(sourceDoc.access) },
    );
  }
}

function preview(previous: unknown, input: {
  version: number;
  now: Date;
  userId?: ObjectId;
  reason: string;
  changedFields: string[];
}): Array<Record<string, unknown>> {
  const list = Array.isArray(previous) ? previous.slice() : [];
  list.push({
    version: input.version,
    changedAt: input.now,
    ...(input.userId ? { changedBy: input.userId } : {}),
    reason: input.reason,
    changedFields: input.changedFields,
  });
  return list.slice(-HARD_CAPS.recentRevisionPreview);
}

async function persist(input: {
  db: Db;
  type: TargetType;
  target: EvidenceDoc;
  evidence: Array<Record<string, unknown>>;
  expectedVersion: number;
  actor: ProvenanceActor;
  now: Date;
  reason: string;
  changedFields: string[];
  auditAction: string;
  beforeSummary: Record<string, string | number | boolean | null>;
  afterSummary: Record<string, string | number | boolean | null>;
}): Promise<ObjectId> {
  if (!input.actor.id) {
    throw new ProvenanceError("FORBIDDEN", "evidence changes require a user actor", 403);
  }
  const nextVersion = input.expectedVersion + 1;
  const next = {
    ...input.target,
    evidence: input.evidence,
    version: nextVersion,
    updatedAt: input.now,
    updatedBy: input.actor.id,
    recentRevisionPreview: preview(input.target.recentRevisionPreview, {
      version: nextVersion,
      now: input.now,
      userId: input.actor.id,
      reason: input.reason,
      changedFields: input.changedFields,
    }),
  };
  validateTarget(input.type, next);
  const update = await input.db.collection(COLLECTIONS[input.type]).updateOne(
    { _id: input.target._id, version: input.expectedVersion },
    {
      $set: {
        evidence: input.evidence,
        updatedAt: input.now,
        updatedBy: input.actor.id,
        recentRevisionPreview: next.recentRevisionPreview,
      },
      $inc: { version: 1 },
    },
  );
  if (update.modifiedCount !== 1) {
    throw new ProvenanceError(
      "VERSION_CONFLICT",
      `${input.type.toLowerCase()} version did not match`,
      409,
    );
  }
  const auditId = await appendAudit(input.db, {
    action: input.auditAction,
    target: { type: input.type, id: input.target._id },
    actor: input.actor,
    targetVersionBefore: input.expectedVersion,
    targetVersionAfter: nextVersion,
    beforeSummary: input.beforeSummary,
    afterSummary: input.afterSummary,
    changedPaths: input.changedFields,
    reason: input.reason,
    now: input.now,
  });
  await requestRebuildsForFinding({
    db: input.db,
    targetType: input.type,
    targetId: input.target._id,
    reason: input.auditAction,
    now: input.now,
  });
  return auditId;
}

async function classifyAppendFailure(
  input: {
    db: Db;
    type: TargetType;
    targetId: ObjectId;
    snapshotId: ObjectId;
    expectedVersion?: number;
  },
): Promise<never> {
  const doc = await input.db.collection(COLLECTIONS[input.type]).findOne({ _id: input.targetId });
  if (!doc) throw new ProvenanceError("NOT_FOUND", "target does not exist", 404);
  if (statusOf(doc) === "ARCHIVED" || statusOf(doc) === "MERGED") {
    throw new ProvenanceError(EDITABLE_LABEL[input.type], "target is not editable", 409);
  }
  const evidence = Array.isArray(doc.evidence) ? doc.evidence : [];
  if (
    evidence.some((item) => {
      const link = item as Record<string, unknown>;
      return String(link.sourceSnapshotId) === input.snapshotId.toString();
    })
  ) {
    throw new ProvenanceError("DUPLICATE_EVIDENCE", "snapshot is already linked", 409);
  }
  if (evidence.length >= HARD_CAPS.evidence) {
    throw new ProvenanceError("CAP_EXCEEDED", "evidence cap exceeded", 422, {
      path: "evidence",
      cap: HARD_CAPS.evidence,
    });
  }
  if (
    input.expectedVersion !== undefined &&
    Number(doc.version ?? 0) !== input.expectedVersion
  ) {
    throw new ProvenanceError("VERSION_CONFLICT", "target version did not match", 409);
  }
  throw new ProvenanceError("VERSION_CONFLICT", "target changed concurrently", 409);
}

async function addLink(input: {
  db: Db;
  targetType: TargetType;
  targetId: ObjectId | string;
  snapshotId: ObjectId | string;
  stance: string;
  locator?: Record<string, unknown>;
  excerpt?: string;
  rationale?: string;
  actor: ProvenanceActor;
  expectedVersion?: number;
  now?: Date;
}): Promise<{ evidenceId: ObjectId; version: number; auditId: ObjectId }> {
  assertNoUnknownKeys(input, ADD_KEYS, "UNKNOWN_EVIDENCE_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, EDIT_ROLES, "actor may not add evidence");
  const targetId = parseObjectId(input.targetId, "INVALID_TARGET", "targetId");
  const snapshotId = parseObjectId(input.snapshotId, "INVALID_SNAPSHOT", "snapshotId");
  if (!(EVIDENCE_STANCES as readonly string[]).includes(input.stance)) {
    throw new ProvenanceError("INVALID_EVIDENCE_STANCE", "stance is not in the registry");
  }
  const locator = locatorOf(input.locator);
  if (input.excerpt !== undefined) {
    if (typeof input.excerpt !== "string") {
      throw new ProvenanceError("INVALID_EVIDENCE", "excerpt must be a string");
    }
    assertCharacterCap("excerpt", input.excerpt);
  }
  if (input.rationale !== undefined) {
    if (typeof input.rationale !== "string") {
      throw new ProvenanceError("INVALID_EVIDENCE", "rationale must be a string");
    }
    assertCharacterCap("rationale", input.rationale);
  }
  const target = await loadTarget(input.db, input.targetType, targetId);
  if (input.expectedVersion !== undefined) {
    assertVersion(target, input.expectedVersion, input.targetType);
  }
  await assertCitableSnapshot(input.db, snapshotId);
  if (!input.actor.id) {
    throw new ProvenanceError("FORBIDDEN", "evidence changes require a user actor", 403);
  }
  const evidenceId = new ObjectId();
  const link = {
    _id: evidenceId,
    sourceSnapshotId: snapshotId,
    stance: input.stance,
    ...(locator ? { locator } : {}),
    ...(input.excerpt === undefined ? {} : { excerpt: input.excerpt }),
    ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
    addedBy: input.actor.id,
    addedAt: now,
  };
  const filter: Record<string, unknown> = {
    _id: targetId,
    recordLifecycle: { $nin: ["ARCHIVED", "MERGED"] },
    $expr: {
      $lt: [{ $size: { $ifNull: ["$evidence", []] } }, HARD_CAPS.evidence],
    },
    evidence: { $not: { $elemMatch: { sourceSnapshotId: snapshotId } } },
  };
  if (input.expectedVersion !== undefined) filter.version = input.expectedVersion;
  const update = await input.db.collection(COLLECTIONS[input.targetType]).updateOne(
    filter,
    [
      {
        $set: {
          evidence: {
            $concatArrays: [{ $ifNull: ["$evidence", []] }, [link]],
          },
          recentRevisionPreview: {
            $slice: [
              {
                $concatArrays: [
                  { $ifNull: ["$recentRevisionPreview", []] },
                  [{
                    version: { $add: ["$version", 1] },
                    changedAt: now,
                    changedBy: input.actor.id,
                    reason: "evidence added",
                    changedFields: ["evidence"],
                  }],
                ],
              },
              -HARD_CAPS.recentRevisionPreview,
            ],
          },
          updatedAt: now,
          updatedBy: input.actor.id,
          version: { $add: ["$version", 1] },
        },
      },
    ],
  );
  if (update.modifiedCount !== 1) {
    await classifyAppendFailure({
      db: input.db,
      type: input.targetType,
      targetId,
      snapshotId,
      expectedVersion: input.expectedVersion,
    });
  }
  const updated = await getDocument(input.db, COLLECTIONS[input.targetType], targetId, "target");
  const updatedEvidence = Array.isArray(updated.evidence) ? updated.evidence : [];
  const version = Number(updated.version ?? 0);
  const auditId = await appendAudit(input.db, {
    action: "EVIDENCE_ADDED",
    target: { type: input.targetType, id: targetId },
    actor: input.actor,
    targetVersionBefore: version - 1,
    targetVersionAfter: version,
    beforeSummary: { evidenceCount: Math.max(updatedEvidence.length - 1, 0) },
    afterSummary: {
      evidenceCount: updatedEvidence.length,
      snapshotId: snapshotId.toString(),
      stance: input.stance,
    },
    changedPaths: ["evidence"],
    reason: "evidence added",
    now,
  });
  return { evidenceId, version, auditId };
}

async function removeLink(input: {
  db: Db;
  targetType: TargetType;
  targetId: ObjectId | string;
  evidenceId: ObjectId | string;
  actor: ProvenanceActor;
  expectedVersion: number;
  reason: string;
  now?: Date;
}): Promise<{ version: number; auditId: ObjectId }> {
  assertNoUnknownKeys(input, REMOVE_KEYS, "UNKNOWN_EVIDENCE_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, EDIT_ROLES, "actor may not remove evidence");
  const targetId = parseObjectId(input.targetId, "INVALID_TARGET", "targetId");
  const evidenceId = parseObjectId(input.evidenceId, "INVALID_EVIDENCE", "evidenceId");
  const reason = requireString(input.reason, "REASON_REQUIRED", "removal requires a reason");
  const target = await loadTarget(input.db, input.targetType, targetId);
  const version = assertVersion(target, input.expectedVersion, input.targetType);
  const current = Array.isArray(target.evidence) ? target.evidence : [];
  const found = current.find((item) =>
    String((item as Record<string, unknown>)._id) === evidenceId.toString()
  );
  if (!found) throw new ProvenanceError("NOT_FOUND", "evidence link does not exist", 404);
  const evidence = current.filter((item) => item !== found);
  const auditId = await persist({
    db: input.db,
    type: input.targetType,
    target,
    evidence,
    expectedVersion: version,
    actor: input.actor,
    now,
    reason,
    changedFields: ["evidence"],
    auditAction: "EVIDENCE_REMOVED",
    beforeSummary: { evidenceCount: current.length },
    afterSummary: {
      evidenceCount: evidence.length,
      snapshotId: String((found as Record<string, unknown>).sourceSnapshotId),
    },
  });
  return { version: version + 1, auditId };
}

async function reviewLink(input: {
  db: Db;
  targetType: TargetType;
  targetId: ObjectId | string;
  evidenceId: ObjectId | string;
  stance?: string;
  actor: ProvenanceActor;
  expectedVersion: number;
  note?: string;
  now?: Date;
}): Promise<{ version: number; auditId: ObjectId }> {
  assertNoUnknownKeys(input, REVIEW_KEYS, "UNKNOWN_EVIDENCE_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, REVIEW_ROLES, "actor may not review evidence");
  const targetId = parseObjectId(input.targetId, "INVALID_TARGET", "targetId");
  const evidenceId = parseObjectId(input.evidenceId, "INVALID_EVIDENCE", "evidenceId");
  if (
    input.stance !== undefined && !(EVIDENCE_STANCES as readonly string[]).includes(input.stance)
  ) {
    throw new ProvenanceError("INVALID_EVIDENCE_STANCE", "stance is not in the registry");
  }
  if (input.note !== undefined && typeof input.note !== "string") {
    throw new ProvenanceError("INVALID_EVIDENCE_REVIEW", "note must be a string");
  }
  if (!input.actor.id) throw new ProvenanceError("FORBIDDEN", "review requires a user actor", 403);
  const target = await loadTarget(input.db, input.targetType, targetId);
  const version = assertVersion(target, input.expectedVersion, input.targetType);
  const current = Array.isArray(target.evidence) ? target.evidence : [];
  let found = false;
  let previousStance = "";
  const evidence = current.map((item) => {
    const link = item as Record<string, unknown>;
    if (String(link._id) !== evidenceId.toString()) return item;
    found = true;
    previousStance = String(link.stance ?? "");
    return {
      ...link,
      ...(input.stance === undefined ? {} : { stance: input.stance }),
      reviewedBy: input.actor.id,
      reviewedAt: now,
    };
  });
  if (!found) throw new ProvenanceError("NOT_FOUND", "evidence link does not exist", 404);
  const auditId = await persist({
    db: input.db,
    type: input.targetType,
    target,
    evidence,
    expectedVersion: version,
    actor: input.actor,
    now,
    reason: input.note ?? "evidence reviewed",
    changedFields: input.stance === undefined ? ["evidence.reviewedBy", "evidence.reviewedAt"] : [
      "evidence.stance",
      "evidence.reviewedBy",
      "evidence.reviewedAt",
    ],
    auditAction: "EVIDENCE_REVIEWED",
    beforeSummary: { evidenceCount: current.length, stance: previousStance },
    afterSummary: {
      evidenceCount: evidence.length,
      stance: input.stance ?? previousStance,
    },
  });
  return { version: version + 1, auditId };
}

export async function addEvidence(input: {
  db: Db;
  claimId: ObjectId | string;
  snapshotId: ObjectId | string;
  stance: string;
  locator?: Record<string, unknown>;
  excerpt?: string;
  rationale?: string;
  actor: ProvenanceActor;
  expectedVersion?: number;
  now?: Date;
}): Promise<{ evidenceId: ObjectId; version: number; auditId: ObjectId }> {
  const { claimId, ...rest } = input;
  return await addLink({ ...rest, targetType: "CLAIM", targetId: claimId });
}

export async function removeEvidence(input: {
  db: Db;
  claimId: ObjectId | string;
  evidenceId: ObjectId | string;
  actor: ProvenanceActor;
  expectedVersion: number;
  reason: string;
  now?: Date;
}): Promise<{ version: number; auditId: ObjectId }> {
  const { claimId, ...rest } = input;
  return await removeLink({ ...rest, targetType: "CLAIM", targetId: claimId });
}

export async function reviewEvidence(input: {
  db: Db;
  claimId: ObjectId | string;
  evidenceId: ObjectId | string;
  stance?: string;
  actor: ProvenanceActor;
  expectedVersion: number;
  note?: string;
  now?: Date;
}): Promise<{ version: number; auditId: ObjectId }> {
  const { claimId, ...rest } = input;
  return await reviewLink({ ...rest, targetType: "CLAIM", targetId: claimId });
}

export async function addRelationshipEvidence(input: {
  db: Db;
  relationshipId: ObjectId | string;
  snapshotId: ObjectId | string;
  stance: string;
  locator?: Record<string, unknown>;
  excerpt?: string;
  rationale?: string;
  actor: ProvenanceActor;
  expectedVersion?: number;
  now?: Date;
}): Promise<{ evidenceId: ObjectId; version: number; auditId: ObjectId }> {
  const { relationshipId, ...rest } = input;
  return await addLink({ ...rest, targetType: "RELATIONSHIP", targetId: relationshipId });
}

export async function removeRelationshipEvidence(input: {
  db: Db;
  relationshipId: ObjectId | string;
  evidenceId: ObjectId | string;
  actor: ProvenanceActor;
  expectedVersion: number;
  reason: string;
  now?: Date;
}): Promise<{ version: number; auditId: ObjectId }> {
  const { relationshipId, ...rest } = input;
  return await removeLink({ ...rest, targetType: "RELATIONSHIP", targetId: relationshipId });
}

export async function reviewRelationshipEvidence(input: {
  db: Db;
  relationshipId: ObjectId | string;
  evidenceId: ObjectId | string;
  stance?: string;
  actor: ProvenanceActor;
  expectedVersion: number;
  note?: string;
  now?: Date;
}): Promise<{ version: number; auditId: ObjectId }> {
  const { relationshipId, ...rest } = input;
  return await reviewLink({ ...rest, targetType: "RELATIONSHIP", targetId: relationshipId });
}
